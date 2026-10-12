//! Backups of the library: the page writes a copy to a file here (SQLite's VACUUM INTO), the
//! reader saves it wherever they choose, and a backup they pick takes the library's place.
//! The library it replaces is kept in the app's `backups` folder, the last few of them.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::Db;

/// How many replaced libraries are kept.
const KEEP: usize = 3;
/// What the page names the libraries it replaces: `webnovel-hub-before-restore-….whub`.
const KEPT_PREFIX: &str = "webnovel-hub-before-restore-";

fn text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn folder(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let folder = app.path().app_data_dir().map_err(text)?.join(name);
    fs::create_dir_all(&folder).map_err(text)?;
    Ok(folder)
}

/// Only the file name: the page never chooses a folder.
fn file_name(name: &str) -> Result<&str, String> {
    Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("not a file name: {name}"))
}

/// Where the page may write a backup before the reader saves it: a file that doesn't exist.
#[tauri::command]
pub fn temp_backup_path(app: AppHandle, name: String) -> Result<String, String> {
    let path = folder(&app, "temp")?.join(file_name(&name)?);
    if path.exists() {
        fs::remove_file(&path).map_err(text)?;
    }
    Ok(path.to_string_lossy().into_owned())
}

/// Asks where to save the backup at `path`, then copies it there. False when the reader
/// cancels. The temporary file is removed either way.
#[tauri::command]
pub async fn save_backup(app: AppHandle, path: String, name: String) -> Result<bool, String> {
    let chosen = app
        .dialog()
        .file()
        .set_file_name(file_name(&name)?)
        .add_filter("Webnovel Hub backup", &["whub"])
        .blocking_save_file();
    let result = match chosen {
        None => Ok(false),
        Some(target) => {
            let target = target.into_path().map_err(text)?;
            fs::copy(&path, target).map(|_| true).map_err(text)
        }
    };
    let _ = fs::remove_file(&path);
    result
}

/// Asks for a backup file and copies it into the app's folder; its path there, or None
/// when the reader cancels.
#[tauri::command]
pub async fn pick_backup(app: AppHandle) -> Result<Option<String>, String> {
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("Webnovel Hub backup", &["whub"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let chosen = chosen.into_path().map_err(text)?;
    let copy = folder(&app, "temp")?.join("restore.whub");
    fs::copy(chosen, &copy).map_err(text)?;
    Ok(Some(copy.to_string_lossy().into_owned()))
}

#[derive(Serialize)]
pub struct KeptBackup {
    name: String,
    path: String,
}

fn kept(folder: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(folder)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok().map(|entry| entry.path()))
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with(KEPT_PREFIX))
                })
                .collect()
        })
        .unwrap_or_default();
    // The names end in the date and time, so the newest sorts last.
    files.sort();
    files.reverse();
    files
}

/// The libraries replaced by a restore, newest first.
#[tauri::command]
pub fn kept_backups(app: AppHandle) -> Result<Vec<KeptBackup>, String> {
    Ok(kept(&folder(&app, "backups")?)
        .into_iter()
        .map(|path| KeptBackup {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
        })
        .collect())
}

/// Puts the backup at `path` (a file of the app's: picked or kept) in place of the library,
/// keeping the current one as `keep_as`. The page has stopped its jobs and reloads after.
#[tauri::command]
pub async fn restore_library(
    app: AppHandle,
    db: State<'_, Db>,
    path: String,
    keep_as: String,
) -> Result<(), String> {
    let backups = folder(&app, "backups")?;
    let mut keep = backups.join(file_name(&keep_as)?);
    // Putting a kept library back within the second it was kept.
    while keep.exists() {
        keep.set_extension("1.whub");
    }
    db.replace_with(Path::new(&path), &keep)?;
    let _ = fs::remove_file(&path);
    for old in kept(&backups).into_iter().skip(KEEP) {
        let _ = fs::remove_file(old);
    }
    Ok(())
}
