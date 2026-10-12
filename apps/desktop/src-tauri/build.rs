fn main() {
    // The app's own commands, so capabilities can grant them one by one.
    let commands = &[
        "db_run",
        "db_exec",
        "temp_backup_path",
        "save_backup",
        "pick_backup",
        "kept_backups",
        "restore_library",
        "render",
        "render_result",
        "open_site_window",
        "save_file",
        "notify",
        "check_update",
        "install_update",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run the Tauri build script");
}
