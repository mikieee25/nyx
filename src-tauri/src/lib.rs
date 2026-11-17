mod artwork;
mod library;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show-nyx", "Show Nyx", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit-nyx", "Quit Nyx", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Nyx Game Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show-nyx" => show_main_window(app),
                    "quit-nyx" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::scan_games,
            library::launch_game,
            artwork::has_sgdb_api_key,
            artwork::set_sgdb_api_key,
            artwork::clear_sgdb_api_key,
            artwork::search_sgdb_games,
            artwork::search_sgdb_artwork,
            artwork::download_sgdb_artwork,
        ])
        .run(tauri::generate_context!())
        .expect("Nyx failed to start");
}
