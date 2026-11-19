use base64::{engine::general_purpose::STANDARD, Engine};
use keyring::Entry;
use reqwest::{redirect::Policy, Client, Url};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};

const API_ROOT: &str = "https://www.steamgriddb.com/api/v2/";
const KEY_SERVICE: &str = "app.nyx.launcher";
const KEY_USER: &str = "steamgriddb-api-key";
const MAX_ART_BYTES: u64 = 8 * 1024 * 1024;

fn trusted_sgdb_host(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    host == "steamgriddb.com"
        || host.ends_with(".steamgriddb.com")
        || (host == "s3.amazonaws.com" && url.path().starts_with("/steamgriddb/"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GameMatch {
    id: u64,
    name: String,
    verified: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GridArtwork {
    id: u64,
    name: String,
    dimensions: String,
    thumb: String,
}

fn key_entry() -> Result<Entry, String> {
    Entry::new(KEY_SERVICE, KEY_USER)
        .map_err(|error| format!("Could not access Windows Credential Manager: {error}"))
}

fn api_key() -> Result<String, String> {
    match key_entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            Err("Add your SteamGridDB API key in Nyx before searching for artwork.".into())
        }
        Err(error) => Err(format!(
            "Could not read the SteamGridDB key from Windows Credential Manager: {error}"
        )),
    }
}

#[tauri::command]
pub(crate) fn has_sgdb_api_key() -> Result<bool, String> {
    match key_entry()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Could not read the SteamGridDB key from Windows Credential Manager: {error}"
        )),
    }
}

#[tauri::command]
pub(crate) fn set_sgdb_api_key(api_key: String) -> Result<(), String> {
    let api_key = api_key.trim();
    if api_key.is_empty() || api_key.len() > 512 {
        return Err("Enter a valid SteamGridDB API key.".into());
    }
    key_entry()?.set_password(api_key).map_err(|error| {
        format!("Could not save the SteamGridDB key to Windows Credential Manager: {error}")
    })
}

#[tauri::command]
pub(crate) fn clear_sgdb_api_key() -> Result<(), String> {
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not remove the SteamGridDB key from Windows Credential Manager: {error}"
        )),
    }
}

fn api_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() < 4 && url.scheme() == "https" && trusted_sgdb_host(url) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|error| format!("Could not prepare SteamGridDB request: {error}"))
}

fn api_url(path: &str) -> Result<Url, String> {
    Url::parse(API_ROOT)
        .and_then(|base| base.join(path))
        .map_err(|error| format!("Invalid SteamGridDB request: {error}"))
}

async fn api_json(path: &str) -> Result<Value, String> {
    let response = api_client()?
        .get(api_url(path)?)
        .bearer_auth(api_key()?)
        .send()
        .await
        .map_err(|error| format!("SteamGridDB request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 => "SteamGridDB rejected the API key. Check it in artwork settings.".into(),
            429 => "SteamGridDB rate limit reached. Try again later.".into(),
            status => format!("SteamGridDB returned HTTP {status}."),
        });
    }
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("SteamGridDB returned invalid data: {error}"))?;
    if value.get("success").and_then(Value::as_bool) == Some(false) {
        return Err(value
            .get("errors")
            .and_then(Value::as_array)
            .and_then(|errors| errors.first())
            .and_then(Value::as_str)
            .unwrap_or("SteamGridDB could not complete the request.")
            .to_string());
    }
    Ok(value)
}

#[tauri::command]
pub(crate) async fn search_sgdb_games(query: String) -> Result<Vec<GameMatch>, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 120 {
        return Err("Enter a game title under 120 characters.".into());
    }
    let mut url = api_url("search/autocomplete/")?;
    url.path_segments_mut()
        .map_err(|_| "Invalid SteamGridDB search URL".to_string())?
        .pop_if_empty()
        .push(query);
    let response = api_json(url.path().trim_start_matches("/api/v2/")).await?;
    Ok(response
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some(GameMatch {
                id: item.get("id")?.as_u64()?,
                name: item.get("name")?.as_str()?.to_string(),
                verified: item
                    .get("verified")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .take(10)
        .collect())
}

#[tauri::command]
pub(crate) async fn search_sgdb_artwork(game_id: u64) -> Result<Vec<GridArtwork>, String> {
    if game_id == 0 {
        return Err("Choose a valid SteamGridDB game.".into());
    }
    let response = api_json(&format!(
        "grids/game/{game_id}?dimensions=600x900&types=static"
    ))
    .await?;
    let mut images = Vec::new();
    for item in response
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(20)
    {
        let (Some(id), Some(url)) = (
            item.get("id").and_then(Value::as_u64),
            item.get("url").and_then(Value::as_str),
        ) else {
            continue;
        };
        let thumb = item.get("thumb").and_then(Value::as_str).unwrap_or(url);
        let Ok(thumb) = media_url(thumb) else {
            continue;
        };
        let dimensions = match (
            item.get("width").and_then(Value::as_u64),
            item.get("height").and_then(Value::as_u64),
        ) {
            (Some(width), Some(height)) => format!("{width} × {height}"),
            _ => "Portrait cover".into(),
        };
        images.push(GridArtwork {
            id,
            name: item
                .get("style")
                .and_then(Value::as_str)
                .unwrap_or("SteamGridDB artwork")
                .to_string(),
            dimensions,
            thumb: thumb.to_string(),
        });
    }
    Ok(images)
}

fn validate_game_folder(game_path: &str, library_roots: &[String]) -> Result<PathBuf, String> {
    let roots = crate::library::canonical_library_roots(library_roots)?;
    let game =
        fs::canonicalize(game_path).map_err(|error| format!("Cannot find game folder: {error}"))?;
    if !roots
        .iter()
        .any(|root| game.parent() == Some(root.as_path()))
        || !game.is_dir()
    {
        return Err("Artwork can only be saved for a game folder directly inside a configured library location.".into());
    }
    Ok(game)
}

fn media_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value)
        .map_err(|_| "SteamGridDB returned an invalid artwork address.".to_string())?;
    if url.scheme() != "https" || !trusted_sgdb_host(&url) {
        return Err("SteamGridDB returned artwork from an untrusted address.".into());
    }
    Ok(url)
}

fn artwork_cache_base(app: &AppHandle, game: &Path) -> Result<PathBuf, String> {
    let game = fs::canonicalize(game)
        .map_err(|error| format!("Could not resolve game folder for artwork cache: {error}"))?;
    let mut hasher = DefaultHasher::new();
    game.to_string_lossy().to_lowercase().hash(&mut hasher);
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate Nyx's local data folder: {error}"))?
        .join("artwork");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create Nyx's artwork cache: {error}"))?;
    Ok(directory.join(format!("{:016x}", hasher.finish())))
}

#[tauri::command]
pub(crate) async fn download_sgdb_artwork(
    app: AppHandle,
    game_path: String,
    game_id: u64,
    artwork_id: u64,
    library_roots: Vec<String>,
) -> Result<(), String> {
    let game = validate_game_folder(&game_path, &library_roots)?;
    if game_id == 0 || artwork_id == 0 {
        return Err("Choose valid SteamGridDB artwork first.".into());
    }
    let response = api_json(&format!(
        "grids/game/{game_id}?dimensions=600x900&types=static"
    ))
    .await?;
    let image_url = response
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|item| item.get("id").and_then(Value::as_u64) == Some(artwork_id))
        .and_then(|item| item.get("url").and_then(Value::as_str))
        .ok_or("That artwork is no longer available. Search again and choose another image.")?;
    let mut response = api_client()?
        .get(media_url(image_url)?)
        .send()
        .await
        .map_err(|error| format!("Artwork download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Artwork server returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_ART_BYTES)
    {
        return Err("This artwork is too large to cache (8 MB maximum).".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Could not read artwork data: {error}"))?
    {
        if bytes.len() + chunk.len() > MAX_ART_BYTES as usize {
            return Err("Artwork data is larger than 8 MB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("Artwork data is empty.".into());
    }
    let extension = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "jpg"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        return Err("SteamGridDB returned an unsupported image format.".into());
    };
    let base = artwork_cache_base(&app, &game)?;
    let path = base.with_extension(extension);
    let temporary = base.with_extension("download");
    fs::write(&temporary, &bytes).map_err(|error| format!("Could not cache artwork: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace cached artwork: {error}"))?;
    }
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finish caching artwork: {error}"))?;
    for old_extension in ["png", "jpg", "webp"]
        .into_iter()
        .filter(|old| *old != extension)
    {
        let old_path = base.with_extension(old_extension);
        if old_path.exists() {
            fs::remove_file(old_path)
                .map_err(|error| format!("Could not remove old cached artwork: {error}"))?;
        }
    }
    Ok(())
}

pub(crate) fn cached_cover(app: &AppHandle, game: &Path) -> Result<Option<String>, String> {
    let base = artwork_cache_base(app, game)?;
    let (path, mime) = [
        ("png", "image/png"),
        ("jpg", "image/jpeg"),
        ("webp", "image/webp"),
    ]
    .into_iter()
    .map(|(extension, mime)| (base.with_extension(extension), mime))
    .find(|(path, _)| path.is_file())
    .unwrap_or((base.with_extension("png"), "image/png"));
    if !path.is_file() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect cached artwork: {error}"))?;
    if metadata.len() > MAX_ART_BYTES {
        return Err("Cached artwork exceeds 8 MB.".into());
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("Could not read cached artwork: {error}"))?;
    Ok(Some(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(bytes)
    )))
}
