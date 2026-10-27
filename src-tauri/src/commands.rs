//! Thin Tauri command layer: validate the input, run blocking work on `spawn_blocking`, map
//! errors to `FsError`. Logic lives in pure modules. Every command is `async` – a synchronous
//! command would run on the main thread and freeze the window on a slow disk. The test
//! [`command_rules`] checks this.

use crate::about;
use crate::error::{FsError, FsErrorCode};
use crate::model::{AppInfo, IconDocumentDto, RecentFileDto, SaveAssetDto, SaveResult};
use crate::sessions::IconSessions;
use crate::windows::{CLOSE_REQUESTED, DocWindows, QuitStep, window_title};
use ai_core::icon::image_file::ImageFile;
use ai_core::icon::save::{AssetInput, assemble};
use ai_core::icon::svg_file::SvgFile;
use ai_core::icon::{self, IconFormat, Limits};
use ai_core::recent;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewWindow};
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

// ---- prompt 008: images ----

/// One image (PNG, JPEG, WebP, SVG; ≤ 20 MiB) as data URL with its natural size (design 008 E8).
#[tauri::command]
pub async fn read_image_file(path: String) -> Result<ImageFile, FsError> {
    let p = file_path(&path)?;
    blocking(move || icon::image_file::read_image_file(&p)).await
}

/// Native "open" dialog for one image; `None` = cancelled.
#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> Result<Option<String>, FsError> {
    blocking(move || {
        Ok(app
            .dialog()
            .file()
            .add_filter("Image", &["png", "jpg", "jpeg", "webp", "svg"])
            .blocking_pick_file()
            .and_then(to_string))
    })
    .await
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
    blocking(move || {
        let list = recent::load(&file).value;
        Ok(RecentFileDto::list(&recent::existing(&list, exists)))
    })
    .await
}

/// Puts `path` in front of the recent files (after open/save) and returns the new list.
#[tauri::command]
pub async fn add_recent_file(app: AppHandle, path: String) -> Result<Vec<RecentFileDto>, FsError> {
    file_path(&path)?;
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

fn window_error(e: tauri::Error) -> FsError {
    FsError::new(FsErrorCode::Io, e.to_string(), None)
}

/// Title of the calling window (`• ` marker, macOS: dot in the close button) and the path it
/// shows (to find a file that is already open, design 003 E10/E11).
#[tauri::command]
pub async fn set_window_title(
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
    title: String,
    edited: bool,
    path: Option<String>,
) -> Result<(), FsError> {
    windows.set_shows(window.label(), path);
    let mac = cfg!(target_os = "macos");
    window
        .set_title(&window_title(&title, edited, mac))
        .map_err(window_error)?;
    #[cfg(target_os = "macos")]
    set_document_edited(&window, edited);
    Ok(())
}

/// `-[NSWindow setDocumentEdited:]` – Tauri has no API for it (design 003 E11). Runs on the main
/// thread (`with_webview`).
#[cfg(target_os = "macos")]
#[allow(clippy::let_unit_value)] // objc2's documented form: the unit return type drives `msg_send!`
fn set_document_edited(window: &WebviewWindow, edited: bool) {
    let _ = window.with_webview(move |webview| {
        let ns_window = webview.ns_window().cast::<objc2::runtime::AnyObject>();
        if !ns_window.is_null() {
            // SAFETY: tauri hands out the live NSWindow of this webview on the main thread.
            unsafe {
                let _: () = objc2::msg_send![&*ns_window, setDocumentEdited: edited];
            }
        }
    });
}

/// Creates the window `label` (same size limits as `main` in `tauri.conf.json`).
pub fn build_document_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, FsError> {
    tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App("index.html".into()))
        .title("AppIconic")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .background_color(tauri::window::Color(0x1c, 0x1d, 0x21, 0xff))
        .build()
        .map_err(window_error)
}

fn focus(app: &AppHandle, label: &str) -> bool {
    match app.get_webview_window(label) {
        Some(w) => {
            let _ = w.unminimize();
            let _ = w.set_focus();
            true
        }
        None => false,
    }
}

/// "New Window" (`path` = `None`) or a file in a new window; a window that already shows `path`
/// comes to the front instead. Returns the window's label.
#[tauri::command]
pub async fn open_document_window(
    app: AppHandle,
    windows: State<'_, DocWindows>,
    path: Option<String>,
) -> Result<String, FsError> {
    if let Some(p) = &path {
        file_path(p)?;
        if let Some(label) = windows.showing(p, None)
            && focus(&app, &label)
        {
            return Ok(label);
        }
    }
    let label = windows.new_label(path);
    build_document_window(&app, &label)?;
    Ok(label)
}

/// Brings another window that shows `path` to the front; `false` if there is none.
#[tauri::command]
pub async fn focus_document_window(
    app: AppHandle,
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
    path: String,
) -> Result<bool, FsError> {
    Ok(windows
        .showing(&path, Some(window.label()))
        .is_some_and(|label| focus(&app, &label)))
}

/// The file the calling window was opened for (once); `None`: start with a new document.
#[tauri::command]
pub async fn window_start_path(
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
) -> Result<Option<String>, FsError> {
    Ok(windows.take_start_path(window.label()))
}

/// From now on the close button of the calling window sends `close-requested` (design 003 E10).
#[tauri::command]
pub async fn take_over_close(
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
) -> Result<(), FsError> {
    windows.take_over_close(window.label());
    Ok(())
}

/// Closes the calling window after the frontend dealt with unsaved changes.
#[tauri::command]
pub async fn close_window(window: WebviewWindow) -> Result<(), FsError> {
    window.destroy().map_err(window_error)
}

/// The action the calling window runs at start (a menu click while no window was open, design
/// 005 E6); once.
#[tauri::command]
pub async fn window_start_action(
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
) -> Result<Option<String>, FsError> {
    Ok(windows.take_start_action(window.label()))
}

/// The menu model of the calling window (design 005 E6): checked, kept, and on macOS shown when
/// that window is in front.
#[tauri::command]
pub async fn set_app_menu(
    app: AppHandle,
    window: WebviewWindow,
    spec: ai_core::menu_spec::MenuSpec,
) -> Result<(), FsError> {
    ai_core::menu_spec::validate(&spec)?;
    let show = app
        .state::<crate::app_menu::MenuSpecs>()
        .store(window.label(), spec.clone());
    if show {
        apply_app_menu(app, spec).await?;
    }
    Ok(())
}

/// macOS: menus are built on the main thread; the answer is awaited off the async runtime.
#[cfg(target_os = "macos")]
async fn apply_app_menu(app: AppHandle, spec: ai_core::menu_spec::MenuSpec) -> Result<(), FsError> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(crate::app_menu::apply(&handle, &spec));
    })
    .map_err(window_error)?;
    blocking(move || {
        rx.recv()
            .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?
            .map_err(window_error)
    })
    .await
}

/// Windows/Linux: the HTML menu bar needs nothing from the backend.
#[cfg(not(target_os = "macos"))]
async fn apply_app_menu(
    _app: AppHandle,
    _spec: ai_core::menu_spec::MenuSpec,
) -> Result<(), FsError> {
    Ok(())
}

/// The user's shortcut overrides (`keymap.json`, design 005 E14).
#[tauri::command]
pub async fn load_keymap_overrides(
    app: AppHandle,
) -> Result<ai_core::keymap_file::KeymapOverrides, FsError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    blocking(move || Ok(ai_core::keymap_file::load(&dir))).await
}

/// Quit (design 005 E13): asks every window about unsaved changes, one after the other.
#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Result<(), FsError> {
    begin_quit(&app);
    Ok(())
}

/// The user cancelled closing the window that Quit was asking: the app stays open.
#[tauri::command]
pub async fn cancel_quit(
    window: WebviewWindow,
    windows: State<'_, DocWindows>,
) -> Result<(), FsError> {
    windows.quit(|q| {
        if q.current() == Some(window.label()) {
            q.cancel();
        }
    });
    Ok(())
}

/// Starts the quit sequence over all windows (the focused one first).
pub fn begin_quit(app: &AppHandle) {
    let mut labels: Vec<String> = app.webview_windows().keys().cloned().collect();
    labels.sort();
    if let Some(i) = labels.iter().position(|l| {
        app.get_webview_window(l)
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false)
    }) {
        let first = labels.remove(i);
        labels.insert(0, first);
    }
    if app.state::<DocWindows>().quit(|q| q.begin(labels)) {
        advance_quit(app);
    }
}

/// Asks the next window (it closes itself or cancels), or exits when none is left.
pub fn advance_quit(app: &AppHandle) {
    use tauri::Emitter;
    let docs = app.state::<DocWindows>();
    loop {
        match docs.quit(|q| q.advance()) {
            QuitStep::Ask(label) => match app.get_webview_window(&label) {
                Some(w) if docs.takes_close(&label) => {
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                    let _ = w.emit_to(label.as_str(), CLOSE_REQUESTED, ());
                    return;
                }
                // no question to ask: `Destroyed` goes on with the next one
                Some(w) => {
                    if w.destroy().is_err() {
                        docs.quit(|q| q.closed(&label));
                        continue;
                    }
                    return;
                }
                None => {
                    docs.quit(|q| q.closed(&label));
                }
            },
            QuitStep::Exit => {
                app.exit(0);
                return;
            }
            QuitStep::Idle => return,
        }
    }
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
        assert!(count >= 25, "found {count} commands");
    }
}
