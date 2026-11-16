mod library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![library::scan_games, library::launch_game])
        .run(tauri::generate_context!())
        .expect("Nyx failed to start");
}
