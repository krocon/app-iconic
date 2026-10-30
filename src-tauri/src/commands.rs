//! Thin Tauri command layer: validate the input, run blocking work on `spawn_blocking`, map
//! errors to `FsError`. Logic lives in pure modules. Every command is `async` – a synchronous
//! command would run on the main thread and freeze the window on a slow disk. The test
//! [`command_rules`] checks this.
//!
//! File and recent commands only take paths from trusted sources (prompt 033 E1, `UserPaths`):
//! the `pick_*` dialogs and "Open Recent" grant what they hand out, the others check with
//! [`allowed`]. Window commands live in `window_commands`, menu and quit in `menu_commands`.

use crate::about;
use crate::error::{FsError, FsErrorCode};
use crate::model::{AppInfo, IconDocumentDto, RecentFileDto, SaveAssetDto, SaveResult};
use crate::sessions::IconSessions;
use ai_core::icon::image_file::ImageFile;
use ai_core::icon::save::{AssetInput, assemble};
use ai_core::icon::svg_file::SvgFile;
use ai_core::icon::{self, IconFormat, Limits};
use ai_core::recent;
use ai_core::user_paths::UserPaths;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Runs blocking work off the async runtime.
pub(crate) async fn blocking<T, F>(f: F) -> Result<T, FsError>
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

/// A path from the frontend that must come from a trusted source (prompt 033 E1): absolute
/// (`invalid_path`) and granted (`not_allowed`).
pub(crate) fn allowed(paths: &UserPaths, path: &str) -> Result<PathBuf, FsError> {
    paths.checked(path)
}

/// Remembers a dialog answer as chosen by the user and hands it on.
pub(crate) fn grant(app: &AppHandle, picked: Option<String>) -> Option<String> {
    if let Some(p) = &picked {
        app.state::<UserPaths>().allow_str([p.as_str()]);
    }
    picked
}

/// Opens a `.icon` (bundle folder or ZIP) and keeps it as the session of `path` (design 002 E5).
#[tauri::command]
pub async fn open_icon(
    sessions: State<'_, IconSessions>,
    paths: State<'_, UserPaths>,
    path: String,
) -> Result<IconDocumentDto, FsError> {
    let p = allowed(&paths, &path)?;
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
    paths: State<'_, UserPaths>,
    path: String,
    format: IconFormat,
    icon_json: Value,
    assets: Vec<SaveAssetDto>,
    from: Option<String>,
) -> Result<SaveResult, FsError> {
    let p = allowed(&paths, &path)?;
    let base = sessions.get(from.as_deref().unwrap_or(&path));
    let inputs = assets
        .into_iter()
        .map(|a| AssetInput {
            name: a.name,
            text: a.text,
            unchanged: a.unchanged,
            source: a.source,
        })
        .collect();
    let file = blocking(move || {
        let file = assemble(base.as_deref(), format, icon_json, inputs, &p)?;
        icon::write_icon(&p, &file)?;
        Ok(file)
    })
    .await?;
    sessions.put(&path, file);
    Ok(SaveResult {
        name: recent::display_name(&path),
        path,
        format,
    })
}

/// Forgets the session of a closed document.
#[tauri::command]
pub async fn close_icon(sessions: State<'_, IconSessions>, path: String) -> Result<(), FsError> {
    sessions.remove(&path);
    Ok(())
}

/// One SVG file as text, for "Import SVG…" (design 002 E15).
#[tauri::command]
pub async fn read_svg_file(paths: State<'_, UserPaths>, path: String) -> Result<SvgFile, FsError> {
    let p = allowed(&paths, &path)?;
    blocking(move || icon::svg_file::read_svg_file(&p)).await
}

pub(crate) fn to_string(p: tauri_plugin_dialog::FilePath) -> Option<String> {
    p.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

/// Native "open" dialog for `.icon`; `folder` picks a bundle folder (Linux/Windows cannot pick
/// folders in the file dialog, design 002 E14). `None` = cancelled.
#[tauri::command]
pub async fn pick_open_icon(app: AppHandle, folder: bool) -> Result<Option<String>, FsError> {
    let handle = app.clone();
    let picked = blocking(move || {
        let d = app.dialog().file();
        let picked = if folder {
            d.blocking_pick_folder()
        } else {
            d.add_filter("Icon", &["icon", "zip"]).blocking_pick_file()
        };
        Ok(picked.and_then(to_string))
    })
    .await?;
    Ok(grant(&handle, picked))
}

/// Native "save as" dialog for `.icon`; `None` = cancelled.
#[tauri::command]
pub async fn pick_save_icon(
    app: AppHandle,
    suggested_name: String,
    format: IconFormat,
) -> Result<Option<String>, FsError> {
    let handle = app.clone();
    let picked = blocking(move || {
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
    .await?;
    Ok(grant(&handle, picked))
}

/// Native "open" dialog for one SVG file; `None` = cancelled.
#[tauri::command]
pub async fn pick_svg_file(app: AppHandle) -> Result<Option<String>, FsError> {
    let handle = app.clone();
    let picked = blocking(move || {
        Ok(app
            .dialog()
            .file()
            .add_filter("SVG", &["svg"])
            .blocking_pick_file()
            .and_then(to_string))
    })
    .await?;
    Ok(grant(&handle, picked))
}

// ---- prompt 008: images ----

/// One image (PNG, JPEG, WebP, SVG; ≤ 20 MiB) as data URL with its natural size (design 008 E8).
#[tauri::command]
pub async fn read_image_file(
    paths: State<'_, UserPaths>,
    path: String,
) -> Result<ImageFile, FsError> {
    let p = allowed(&paths, &path)?;
    blocking(move || icon::image_file::read_image_file(&p)).await
}

/// Native "open" dialog for one image; `None` = cancelled.
#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> Result<Option<String>, FsError> {
    let handle = app.clone();
    let picked = blocking(move || {
        Ok(app
            .dialog()
            .file()
            .add_filter("Image", &["png", "jpg", "jpeg", "webp", "svg"])
            .blocking_pick_file()
            .and_then(to_string))
    })
    .await?;
    Ok(grant(&handle, picked))
}

// ---- prompt 003: recent files, windows ----

/// Serialises read-modify-write of `recent.json` across windows (design 003 E12).
#[derive(Default)]
pub struct RecentLock(Mutex<()>);

fn recent_file(app: &AppHandle) -> Result<PathBuf, FsError> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(recent::FILE_NAME))
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))
}

fn exists(p: &str) -> bool {
    Path::new(p).exists()
}

/// "Open Recent": the entries whose file still exists, newest first.
#[tauri::command]
pub async fn recent_files(app: AppHandle) -> Result<Vec<RecentFileDto>, FsError> {
    let file = recent_file(&app)?;
    let list = blocking(move || {
        let list = recent::load(&file).value;
        Ok(recent::existing(&list, exists))
    })
    .await?;
    // "Open Recent" is a trusted source: the user opened or saved these files before
    app.state::<UserPaths>()
        .allow_str(list.iter().map(String::as_str));
    Ok(RecentFileDto::list(&list))
}

/// Puts `path` in front of the recent files (after open/save) and returns the new list.
#[tauri::command]
pub async fn add_recent_file(app: AppHandle, path: String) -> Result<Vec<RecentFileDto>, FsError> {
    // only a file opened or saved here – else this list would launder any path (prompt 033 E1)
    allowed(&app.state::<UserPaths>(), &path)?;
    let file = recent_file(&app)?;
    blocking(move || {
        let lock = app.state::<RecentLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        let loaded = recent::load(&file);
        let list = recent::add(&loaded.value, &path, exists);
        // a file we could not read stays untouched (config_file `persist`)
        if loaded.persist {
            recent::save(&file, &list)?;
        }
        Ok(RecentFileDto::list(&list))
    })
    .await
}

/// "Clear Menu".
#[tauri::command]
pub async fn clear_recent_files(app: AppHandle) -> Result<(), FsError> {
    let file = recent_file(&app)?;
    blocking(move || {
        let lock = app.state::<RecentLock>();
        let _guard = lock.0.lock().unwrap_or_else(|e| e.into_inner());
        recent::save(&file, &[])
    })
    .await
}

/// The licence texts of everything inside the app (`THIRD-PARTY-NOTICES.txt`, `pnpm notices`;
/// compiled in so the About dialog shows them in every build – design 030 E7).
#[tauri::command]
pub async fn third_party_notices() -> Result<String, FsError> {
    Ok(include_str!("../../THIRD-PARTY-NOTICES.txt").to_owned())
}

#[cfg(test)]
mod path_rules {
    use super::*;

    #[test]
    fn only_absolute_and_trusted_paths() {
        let paths = UserPaths::default();
        assert_eq!(
            allowed(&paths, "").unwrap_err().code,
            FsErrorCode::InvalidPath
        );
        assert_eq!(
            allowed(&paths, "a.icon").unwrap_err().code,
            FsErrorCode::InvalidPath
        );
        let abs = std::env::temp_dir().join("a.icon");
        let s = abs.to_str().unwrap();
        assert_eq!(
            allowed(&paths, s).unwrap_err().code,
            FsErrorCode::NotAllowed
        );
        paths.allow_str([s]);
        assert_eq!(allowed(&paths, s).unwrap(), abs);
    }

    /// Every command that takes a path from the WebView checks it (prompt 033 E1): the source
    /// of each one names `allowed(` or `checked(`.
    #[test]
    fn path_commands_check_their_paths() {
        for (src, names) in [
            (
                include_str!("commands.rs"),
                &[
                    "open_icon",
                    "save_icon",
                    "read_svg_file",
                    "read_image_file",
                    "add_recent_file",
                ][..],
            ),
            (
                include_str!("export_commands.rs"),
                &["export_svg", "export_png"][..],
            ),
            (
                include_str!("window_commands.rs"),
                &["open_document_window"][..],
            ),
        ] {
            for name in names {
                let at = src.find(&format!("pub async fn {name}(")).expect(name);
                let body = &src[at..at + src[at..].find("\n}\n").expect(name)];
                assert!(
                    body.contains("allowed(") || body.contains("checked("),
                    "{name} does not check its path"
                );
            }
        }
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
        assert_eq!(count, 15, "found {count} commands");
    }
}
