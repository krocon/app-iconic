//! Thin Tauri command layer: validate the input, run blocking work on `spawn_blocking`, map
//! errors to `FsError`. Logic lives in pure modules. Every command is `async` – a synchronous
//! command would run on the main thread and freeze the window on a slow disk. The test
//! [`command_rules`] checks this.

use crate::about;
use crate::error::{FsError, FsErrorCode};
use crate::model::{AppInfo, IconDocumentDto, SaveAssetDto, SaveResult};
use crate::sessions::IconSessions;
use ai_core::icon::save::{AssetInput, assemble};
use ai_core::icon::svg_file::SvgFile;
use ai_core::icon::{self, IconFormat, Limits};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Runs blocking work off the async runtime.
async fn blocking<T, F>(f: F) -> Result<T, FsError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, FsError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?
}

/// Name, version (from `package.json` via `tauri.conf.json`) and platform for the About dialog.
#[tauri::command]
pub async fn get_app_info(app: AppHandle) -> Result<AppInfo, FsError> {
    let pkg = app.package_info();
    Ok(about::app_info("AppIconic", &pkg.version.to_string()))
}

/// A path from the frontend (opaque there, CLAUDE.md §4) – must be absolute.
fn file_path(path: &str) -> Result<PathBuf, FsError> {
    let p = PathBuf::from(path);
    if path.is_empty() || !p.is_absolute() {
        return Err(FsError::new(
            FsErrorCode::InvalidPath,
            "path must be absolute",
            Some(&p),
        ));
    }
    Ok(p)
}

/// Opens a `.icon` (bundle folder or ZIP) and keeps it as the session of `path` (design 002 E5).
#[tauri::command]
pub async fn open_icon(
    sessions: State<'_, IconSessions>,
    path: String,
) -> Result<IconDocumentDto, FsError> {
    let p = file_path(&path)?;
    let file = blocking(move || icon::read_icon(&p, &Limits::default())).await?;
    let dto = IconDocumentDto::from_file(Some(path.clone()), &file);
    sessions.put(&path, file);
    Ok(dto)
}

/// A new document (design 002 E13) – no path, no session.
#[tauri::command]
pub async fn new_icon() -> Result<IconDocumentDto, FsError> {
    Ok(IconDocumentDto::from_file(None, &icon::new_icon()))
}

/// Saves in `format`; unchanged assets come from the session of `from` (default `path`).
#[tauri::command]
pub async fn save_icon(
    sessions: State<'_, IconSessions>,
    path: String,
    format: IconFormat,
    icon_json: Value,
    assets: Vec<SaveAssetDto>,
    from: Option<String>,
) -> Result<SaveResult, FsError> {
    let p = file_path(&path)?;
    let base = sessions.get(from.as_deref().unwrap_or(&path));
    let inputs = assets
        .into_iter()
        .map(|a| AssetInput {
            name: a.name,
            text: a.text,
            unchanged: a.unchanged,
        })
        .collect();
    let file = blocking(move || {
        let file = assemble(base.as_deref(), format, icon_json, inputs, &p)?;
        icon::write_icon(&p, &file)?;
        Ok(file)
    })
    .await?;
    sessions.put(&path, file);
    Ok(SaveResult { path, format })
}

/// Forgets the session of a closed document.
#[tauri::command]
pub async fn close_icon(sessions: State<'_, IconSessions>, path: String) -> Result<(), FsError> {
    sessions.remove(&path);
    Ok(())
}

/// One SVG file as text, for "Import SVG…" (design 002 E15).
#[tauri::command]
pub async fn read_svg_file(path: String) -> Result<SvgFile, FsError> {
    let p = file_path(&path)?;
    blocking(move || icon::svg_file::read_svg_file(&p)).await
}

fn to_string(p: tauri_plugin_dialog::FilePath) -> Option<String> {
    p.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

/// Native "open" dialog for `.icon`; `folder` picks a bundle folder (Linux/Windows cannot pick
/// folders in the file dialog, design 002 E14). `None` = cancelled.
#[tauri::command]
pub async fn pick_open_icon(app: AppHandle, folder: bool) -> Result<Option<String>, FsError> {
    blocking(move || {
        let d = app.dialog().file();
        let picked = if folder {
            d.blocking_pick_folder()
        } else {
            d.add_filter("Icon", &["icon", "zip"]).blocking_pick_file()
        };
        Ok(picked.and_then(to_string))
    })
    .await
}

/// Native "save as" dialog for `.icon`; `None` = cancelled.
#[tauri::command]
pub async fn pick_save_icon(
    app: AppHandle,
    suggested_name: String,
    format: IconFormat,
) -> Result<Option<String>, FsError> {
    blocking(move || {
        let ext: &[&str] = match format {
            IconFormat::Bundle => &["icon"],
            IconFormat::Zip => &["icon", "zip"],
        };
        Ok(app
            .dialog()
            .file()
            .set_file_name(suggested_name)
            .add_filter("Icon", ext)
            .blocking_save_file()
            .and_then(to_string))
    })
    .await
}

/// Native "open" dialog for one SVG file; `None` = cancelled.
#[tauri::command]
pub async fn pick_svg_file(app: AppHandle) -> Result<Option<String>, FsError> {
    blocking(move || {
        Ok(app
            .dialog()
            .file()
            .add_filter("SVG", &["svg"])
            .blocking_pick_file()
            .and_then(to_string))
    })
    .await
}

#[cfg(test)]
mod path_rules {
    use super::*;

    #[test]
    fn only_absolute_paths() {
        assert_eq!(file_path("").unwrap_err().code, FsErrorCode::InvalidPath);
        assert_eq!(
            file_path("a.icon").unwrap_err().code,
            FsErrorCode::InvalidPath
        );
        let abs = std::env::temp_dir().join("a.icon");
        assert_eq!(file_path(abs.to_str().unwrap()).unwrap(), abs);
    }
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn`.
    #[test]
    fn commands_are_async() {
        let src = include_str!("commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let next = lines.next().unwrap_or_default().trim();
                assert!(
                    next.starts_with("pub async fn"),
                    "synchronous command: {next}"
                );
                count += 1;
            }
        }
        assert!(count >= 9, "found {count} commands");
    }
}
