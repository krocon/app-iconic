//! Menu and quit commands (split from `commands.rs` in prompt 033, behaviour unchanged): the menu
//! model per window (design 005 E6), shortcut overrides (005 E14) and the quit sequence over all
//! windows (005 E13). Every command is `async` (test `command_rules`).

use crate::commands::blocking;
use crate::error::{FsError, FsErrorCode};
#[cfg(target_os = "macos")]
use crate::window_commands::window_error;
use crate::windows::{CLOSE_REQUESTED, DocWindows, QuitStep};
use tauri::{AppHandle, Manager, State, WebviewWindow};

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

/// Event to every window after the shortcuts changed (payload `KeymapOverrides`, design 085 E3).
pub const KEYMAP_CHANGED: &str = "keymap-changed";

/// The shortcut editor's patch (design 085 E2/E3): written to `<app config>/keymap.json` – the
/// path is the app's own, none comes from the WebView – then every window rebuilds its keymap
/// (and with it the native menu's accelerators, design 005 E6).
#[tauri::command]
pub async fn save_keymap(
    app: AppHandle,
    changes: ai_core::keymap_file::KeymapChanges,
) -> Result<ai_core::keymap_file::KeymapOverrides, FsError> {
    use tauri::Emitter;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    let saved = blocking(move || ai_core::keymap_file::save(&dir, &changes)).await?;
    let _ = app.emit(KEYMAP_CHANGED, saved.clone());
    Ok(saved)
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
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn`.
    #[test]
    fn commands_are_async() {
        let src = include_str!("menu_commands.rs");
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
        assert_eq!(count, 5);
    }
}
