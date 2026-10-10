//! Webnovel Hub for Windows: the web app in a WebView2 window, with its library in SQLite,
//! requests to source sites through Tauri's HTTP plugin, and a tray icon for fetching
//! after the window is closed.

// No console window next to the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod render;
mod shell;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // First, so a second launch only brings the open window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(render::Renderer::default())
        .invoke_handler(tauri::generate_handler![
            db::db_run,
            db::db_exec,
            render::render,
            render::render_result,
            render::open_site_window,
            shell::save_file,
            shell::notify,
            shell::check_update,
            shell::install_update,
        ])
        .setup(|app| {
            let folder = app.path().app_data_dir()?;
            std::fs::create_dir_all(&folder)?;
            app.manage(db::Db::open(&folder.join("library.db"))?);
            shell::create_tray(app)?;
            Ok(())
        })
        .on_window_event(shell::on_window_event)
        .run(tauri::generate_context!())
        .expect("Webnovel Hub couldn't start");
}
