//! The own symbol library (prompt 084, design E5–E10): `<app config>/symbols/` through
//! `ai_core::symbols`. The WebView names symbols by id and gets cleaned markup back – never a
//! path of that folder. Import and export take a folder the user picked in a dialog
//! (`pick_export_dir`), checked with `allowed` (prompt 033 E1).

use crate::commands::{allowed, blocking, config_dir};
use crate::error::FsError;
use crate::model::{LibrarySymbolDto, SymbolExportDto, SymbolImportDto, SymbolLibraryDto};
use ai_core::symbols::{self, recent};
use ai_core::user_paths::UserPaths;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Serialises changes of the library and of `recent.json` across windows.
#[derive(Default)]
pub struct SymbolLock(Mutex<()>);

fn library(app: &AppHandle) -> Result<PathBuf, FsError> {
    config_dir(app).map(|d| d.join(symbols::DIR_NAME))
}

/// Runs `f` on the library folder under the lock, off the async runtime.
async fn with_library<T, F>(app: AppHandle, f: F) -> Result<T, FsError>
where
    T: Send + 'static,
    F: FnOnce(&std::path::Path) -> Result<T, FsError> + Send + 'static,
{
    let dir = library(&app)?;
    blocking(move || {
        let lock = app.state::<SymbolLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        f(&dir)
    })
    .await
}

/// The library (cleaned on loading) and the recently used symbols.
#[tauri::command]
pub async fn list_symbols(app: AppHandle) -> Result<SymbolLibraryDto, FsError> {
    with_library(app, |dir| {
        Ok(SymbolLibraryDto {
            symbols: symbols::list(dir).into_iter().map(Into::into).collect(),
            recent: recent::load(&dir.join(recent::FILE_NAME)).value,
        })
    })
    .await
}

/// Saves `svg` (cleaned) as a new symbol.
#[tauri::command]
pub async fn save_symbol(
    app: AppHandle,
    name: String,
    tags: Vec<String>,
    svg: String,
) -> Result<LibrarySymbolDto, FsError> {
    with_library(app, move |dir| {
        symbols::save(dir, &name, &tags, &svg).map(Into::into)
    })
    .await
}

/// Renames a symbol and sets its tags.
#[tauri::command]
pub async fn update_symbol(
    app: AppHandle,
    id: String,
    name: String,
    tags: Vec<String>,
) -> Result<LibrarySymbolDto, FsError> {
    with_library(app, move |dir| {
        symbols::update(dir, &id, &name, &tags).map(Into::into)
    })
    .await
}

/// Removes a symbol (and its entry among the recently used); `false` if there was none.
#[tauri::command]
pub async fn delete_symbol(app: AppHandle, id: String) -> Result<bool, FsError> {
    with_library(app, move |dir| {
        let removed = symbols::delete(dir, &id)?;
        recent::forget(&dir.join(recent::FILE_NAME), "mine", &id)?;
        Ok(removed)
    })
    .await
}

/// Puts a symbol of any set in front of the recently used ones; returns the new list.
#[tauri::command]
pub async fn record_symbol_use(
    app: AppHandle,
    set: String,
    id: String,
) -> Result<Vec<recent::SymbolRef>, FsError> {
    with_library(app, move |dir| {
        recent::record(&dir.join(recent::FILE_NAME), recent::SymbolRef { set, id })
    })
    .await
}

/// Imports the SVG files of a folder the user picked.
#[tauri::command]
pub async fn import_symbols(app: AppHandle, path: String) -> Result<SymbolImportDto, FsError> {
    let src = allowed(&app.state::<UserPaths>(), &path)?;
    with_library(app, move |dir| {
        let r = symbols::import_folder(dir, &src)?;
        Ok(SymbolImportDto {
            imported: r.imported,
            skipped: r.skipped,
            full: r.full,
        })
    })
    .await
}

/// Writes the library into a new folder inside the folder the user picked.
#[tauri::command]
pub async fn export_symbols(app: AppHandle, path: String) -> Result<SymbolExportDto, FsError> {
    let target = allowed(&app.state::<UserPaths>(), &path)?;
    with_library(app, move |dir| {
        let (folder, count) = symbols::export_folder(dir, &target)?;
        Ok(SymbolExportDto {
            folder: folder.to_string_lossy().into_owned(),
            count,
        })
    })
    .await
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("symbol_commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let next = lines.next().unwrap_or_default().trim();
                assert!(next.starts_with("pub async fn"), "synchronous: {next}");
                count += 1;
            }
        }
        assert_eq!(count, 7);
    }
}
