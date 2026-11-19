use crate::artwork;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Emitter, Manager};

const MAX_COVER_BYTES: u64 = 8 * 1024 * 1024;
const ART_NAMES: [&str; 5] = ["cover", "poster", "artwork", "banner", "folder"];
const ART_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];
const ART_DIRECTORIES: [&str; 5] = ["covers", "art", "artwork", "images", "media"];

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
    icon_data_url: Option<String>,
    executables: Vec<ExecutableCandidate>,
}

#[tauri::command]
pub(crate) fn scan_games(
    app: AppHandle,
    library_roots: Vec<String>,
) -> Result<Vec<GameFolder>, String> {
    let roots = canonical_library_roots(&library_roots)?;
    let mut folders = Vec::new();

    for root in roots {
        let entries = fs::read_dir(&root)
            .map_err(|error| format!("Cannot read library folder {}: {error}", root.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!("Cannot inspect a folder in {}: {error}", root.display())
            })?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Cannot inspect {}: {error}", entry.path().display()))?;
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            let executables = find_executables(&path)?;
            let cover_data_url = artwork::cached_cover(&app, &path)?.or_else(|| find_cover(&path));
            folders.push(GameFolder {
                name: entry.file_name().to_string_lossy().into_owned(),
                cover_data_url,
                icon_data_url: executables
                    .first()
                    .and_then(|candidate| executable_icon(Path::new(&candidate.path))),
                executables,
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(folders)
}

pub(crate) fn canonical_library_roots(paths: &[String]) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();
    for path in paths {
        let root = fs::canonicalize(path)
            .map_err(|error| format!("Cannot access library folder {path}: {error}"))?;
        if !root.is_dir() {
            return Err(format!(
                "Library location is not a folder: {}",
                root.display()
            ));
        }
        if !roots.iter().any(|existing: &PathBuf| {
            existing
                .to_string_lossy()
                .eq_ignore_ascii_case(&root.to_string_lossy())
        }) {
            roots.push(root);
        }
    }
    Ok(roots)
}

fn find_executables(game_root: &Path) -> Result<Vec<ExecutableCandidate>, String> {
    let mut pending = vec![game_root.to_path_buf()];
    let mut candidates = Vec::new();
    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Cannot scan {}: {error}", directory.display()))?;
        for entry in entries {
            let entry = entry
                .map_err(|error| format!("Cannot inspect {}: {error}", directory.display()))?;
            let kind = entry
                .file_type()
                .map_err(|error| format!("Cannot inspect {}: {error}", entry.path().display()))?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                pending.push(entry.path());
                continue;
            }
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
    path.extension()
        .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("exe"))
}

fn find_cover(root: &Path) -> Option<String> {
    let canonical_root = fs::canonicalize(root).ok()?;
    let folder_name = root.file_name()?.to_string_lossy();
    let candidates = ART_NAMES
        .iter()
        .flat_map(|name| {
            ART_EXTENSIONS
                .iter()
                .map(move |extension| root.join(format!("{name}.{extension}")))
        })
        .chain(
            ART_EXTENSIONS
                .iter()
                .map(|extension| root.join(format!("{folder_name}.{extension}"))),
        )
        .chain(ART_DIRECTORIES.iter().flat_map(|directory| {
            ART_NAMES.iter().flat_map(move |name| {
                ART_EXTENSIONS
                    .iter()
                    .map(move |extension| root.join(directory).join(format!("{name}.{extension}")))
            })
        }));
    for path in candidates {
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() > MAX_COVER_BYTES
        {
            continue;
        }
        let Ok(canonical_path) = fs::canonicalize(&path) else {
            continue;
        };
        if !canonical_path.starts_with(&canonical_root) {
            continue;
        }
        let Ok(bytes) = fs::read(&canonical_path) else {
            continue;
        };
        let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => continue,
        };
        return Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
    }
    None
}

#[cfg(windows)]
fn executable_icon(path: &Path) -> Option<String> {
    use std::{mem, os::windows::ffi::OsStrExt};
    use windows::{
        core::PCWSTR,
        Win32::{
            Graphics::Gdi::{
                CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject,
                BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
            },
            UI::{
                Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
                WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL},
            },
        },
    };

    const SIZE: i32 = 128;
    let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut file_info = SHFILEINFOW::default();
    unsafe {
        if SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            Default::default(),
            Some(&mut file_info),
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        ) == 0
            || file_info.hIcon.is_invalid()
        {
            return None;
        }
        let bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: SIZE,
                biHeight: -SIZE,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = std::ptr::null_mut();
        let bitmap =
            match CreateDIBSection(None, &bitmap_info, DIB_RGB_COLORS, &mut pixels, None, 0) {
                Ok(bitmap) => bitmap,
                Err(_) => {
                    let _ = DestroyIcon(file_info.hIcon);
                    return None;
                }
            };
        let dc = CreateCompatibleDC(None);
        if dc.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DestroyIcon(file_info.hIcon);
            return None;
        }
        let previous = SelectObject(dc, HGDIOBJ(bitmap.0));
        let drawn = DrawIconEx(dc, 0, 0, file_info.hIcon, SIZE, SIZE, 0, None, DI_NORMAL).is_ok();
        let _ = SelectObject(dc, previous);
        let _ = DeleteDC(dc);
        let _ = DestroyIcon(file_info.hIcon);
        if !drawn || pixels.is_null() {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            return None;
        }
        let bgra = std::slice::from_raw_parts(pixels.cast::<u8>(), (SIZE * SIZE * 4) as usize);
        let rgba: Vec<u8> = bgra
            .chunks_exact(4)
            .flat_map(|pixel| [pixel[2], pixel[1], pixel[0], pixel[3]])
            .collect();
        let mut png_bytes = Vec::new();
        let encoded = (|| {
            let mut encoder = png::Encoder::new(&mut png_bytes, SIZE as u32, SIZE as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.write_header().ok()?.write_image_data(&rgba).ok()?;
            Some(())
        })();
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        encoded?;
        Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(png_bytes)
        ))
    }
}

#[cfg(not(windows))]
fn executable_icon(_path: &Path) -> Option<String> {
    None
}

#[tauri::command]
pub(crate) fn launch_game(
    app: AppHandle,
    executable_path: String,
    library_roots: Vec<String>,
) -> Result<(), String> {
    let roots = canonical_library_roots(&library_roots)?;
    let executable = fs::canonicalize(&executable_path)
        .map_err(|error| format!("Cannot find the selected game executable: {error}"))?;
    if !roots.iter().any(|root| executable.starts_with(root))
        || !executable.is_file()
        || !is_exe(&executable)
    {
        return Err("The selected executable is outside the configured library folders.".into());
    }
    let working_directory: PathBuf = executable
        .parent()
        .ok_or("The executable has no parent folder")?
        .to_path_buf();
    let mut child = Command::new(&executable)
        .current_dir(working_directory)
        .spawn()
        .map_err(|error| format!("Windows could not start {}: {error}", executable.display()))?;

    if let Err(error) = app.emit("game-started", &executable_path) {
        eprintln!("Nyx could not notify the launcher that the game started: {error}");
    }

    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.hide() {
            eprintln!("Nyx could not hide its window while the game runs: {error}");
        }
    }

    std::thread::spawn(move || {
        if let Err(error) = child.wait() {
            eprintln!("Nyx could not wait for the game process to exit: {error}");
        }
        crate::show_main_window(&app);
        if let Err(error) = app.emit("game-exited", ()) {
            eprintln!("Nyx could not notify the launcher that the game exited: {error}");
        }
    });
    Ok(())
}
