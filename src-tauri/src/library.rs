use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, process::Command};

const LIBRARY_ROOT: &str = r"D:\Games";
const MAX_COVER_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub(crate) struct ExecutableCandidate {
    path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GameFolder {
    path: String,
    name: String,
    cover_data_url: Option<String>,
    executables: Vec<ExecutableCandidate>,
}

#[tauri::command]
pub(crate) fn scan_games() -> Result<Vec<GameFolder>, String> {
    let root = Path::new(LIBRARY_ROOT);
    let entries = fs::read_dir(root).map_err(|error| format!("Cannot read {LIBRARY_ROOT}: {error}"))?;
    let mut folders = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| format!("Cannot inspect a folder in {LIBRARY_ROOT}: {error}"))?;
        let file_type = entry.file_type().map_err(|error| format!("Cannot inspect {}: {error}", entry.path().display()))?;
        if !file_type.is_dir() || file_type.is_symlink() { continue; }
        let path = entry.path();
        folders.push(GameFolder {
            name: entry.file_name().to_string_lossy().into_owned(),
            cover_data_url: find_cover(&path),
            executables: find_executables(&path)?,
            path: path.to_string_lossy().into_owned(),
        });
    }
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(folders)
}

fn find_executables(game_root: &Path) -> Result<Vec<ExecutableCandidate>, String> {
    let mut pending = vec![game_root.to_path_buf()];
    let mut candidates = Vec::new();
    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory).map_err(|error| format!("Cannot scan {}: {error}", directory.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("Cannot inspect {}: {error}", directory.display()))?;
            let kind = entry.file_type().map_err(|error| format!("Cannot inspect {}: {error}", entry.path().display()))?;
            if kind.is_symlink() { continue; }
            if kind.is_dir() { pending.push(entry.path()); continue; }
            if kind.is_file() && is_exe(&entry.path()) {
                candidates.push(ExecutableCandidate {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path().to_string_lossy().into_owned(),
                });
            }
        }
    }
    candidates.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(candidates)
}

fn is_exe(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("exe"))
}

fn find_cover(root: &Path) -> Option<String> {
    let canonical_root = fs::canonicalize(root).ok()?;
    for name in ["cover.png", "cover.jpg", "cover.jpeg", "cover.webp", "folder.png", "folder.jpg", "folder.jpeg", "folder.webp"] {
        let path = root.join(name);
        let Ok(metadata) = fs::symlink_metadata(&path) else { continue; };
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_COVER_BYTES { continue; }
        let Ok(canonical_path) = fs::canonicalize(&path) else { continue; };
        if !canonical_path.starts_with(&canonical_root) { continue; }
        let Ok(bytes) = fs::read(&canonical_path) else { continue; };
        let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", _ => continue,
        };
        return Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
    }
    None
}

#[tauri::command]
pub(crate) fn launch_game(executable_path: String) -> Result<(), String> {
    let root = fs::canonicalize(LIBRARY_ROOT).map_err(|error| format!("Cannot access {LIBRARY_ROOT}: {error}"))?;
    let executable = fs::canonicalize(&executable_path).map_err(|error| format!("Cannot find the selected game executable: {error}"))?;
    if !executable.starts_with(&root) || !executable.is_file() || !is_exe(&executable) {
        return Err("The selected file is not an .exe inside D:\\Games.".into());
    }
    let working_directory: PathBuf = executable.parent().ok_or("The executable has no parent folder")?.to_path_buf();
    Command::new(&executable).current_dir(working_directory).spawn()
        .map(|_| ())
        .map_err(|error| format!("Windows could not start {}: {error}", executable.display()))
}
