//! Window commands (split from `commands.rs` in prompt 033, behaviour unchanged): document
//! windows, titles, the close takeover and start paths/actions (design 003 E10/E11, 005 E6).
//! Every command is `async` (test `command_rules`).

use crate::error::{FsError, FsErrorCode};
use crate::windows::{DocWindows, window_title};
use ai_core::user_paths::UserPaths;
use tauri::{AppHandle, Manager, State, WebviewWindow};

pub(crate) fn window_error(e: tauri::Error) -> FsError {
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

/// Brings window `label` to the front; `false` if there is none.
pub(crate) fn focus(app: &AppHandle, label: &str) -> bool {
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
        // the new window opens it: only a trusted path (prompt 033 E1)
        app.state::<UserPaths>().checked(p)?;
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

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn`.
    #[test]
    fn commands_are_async() {
        let src = include_str!("window_commands.rs");
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
        assert_eq!(count, 7);
    }
}
