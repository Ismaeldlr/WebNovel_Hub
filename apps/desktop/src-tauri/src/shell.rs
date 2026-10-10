//! The Windows parts around the page: the tray icon, what closing the window does, system
//! notifications, saving files and updates.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

use crate::db::Db;

const MAIN: &str = "main";

/// Whether the reader has been told that the app went on in the notification area.
static TOLD_ABOUT_TRAY: AtomicBool = AtomicBool::new(false);

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Webnovel Hub", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Webnovel Hub")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Closing the window quits, unless the reader chose to keep fetching in the background:
/// then the window hides and the tray icon brings it back.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != MAIN {
        return;
    }
    let app = window.app_handle();
    if !app.state::<Db>().background_fetching() {
        app.exit(0);
        return;
    }
    api.prevent_close();
    let _ = window.hide();
    if !TOLD_ABOUT_TRAY.swap(true, Ordering::Relaxed) {
        let _ = app
            .notification()
            .builder()
            .title("Webnovel Hub keeps fetching")
            .body("It is in the notification area. Choose Quit there to stop it.")
            .show();
    }
}

/// A system notification, shown only while the window is out of sight.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) {
    let in_sight = app.get_webview_window(MAIN).is_some_and(|window| {
        window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
    });
    if !in_sight {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

/// Asks where to save the file, then writes it. False when the reader cancels.
#[tauri::command]
pub async fn save_file(app: AppHandle, name: String, data: String) -> Result<bool, String> {
    let bytes = STANDARD.decode(data).map_err(|error| error.to_string())?;
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(extension) = Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
    {
        dialog = dialog.add_filter(format!("{} file", extension.to_uppercase()), &[extension]);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, bytes).map_err(|error| error.to_string())?;
    Ok(true)
}

/// The version of a newer release, or None when this one is the latest.
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let update = updater.check().await.map_err(|error| error.to_string())?;
    Ok(update.map(|update| update.version))
}

/// Downloads and installs the newer release, then starts it.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Ok(());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart();
}
