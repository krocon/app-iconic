//! Settings commands (prompt 015): thin layer over `ai_core::settings`. Rust keeps the current
//! settings in memory (one state for every window, design 015 E4): windows send patches, every
//! change is written atomically and sent to **all** windows as `settings-changed`, new windows
//! start with the current state. Nach editlicious `commands.rs` (`load_settings`/`save_settings`).

use crate::commands::blocking;
use crate::error::{FsError, FsErrorCode};
use ai_core::config_file::{ConfigWarning, Loaded};
use ai_core::settings::{self, Settings};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

/// Event to every window after a change (payload [`SettingsChanged`]).
pub const SETTINGS_CHANGED: &str = "settings-changed";

/// The settings of the process: loaded once, then changed by patches.
#[derive(Default)]
pub struct SettingsState(Mutex<Option<Current>>);

struct Current {
    value: Settings,
    /// `false` = the file could not be read – do not write over it (`config_file`).
    persist: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSettings {
    pub value: Settings,
    pub warning: Option<ConfigWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsChanged {
    pub settings: Settings,
    /// Label of the window that made the change.
    pub from: String,
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, FsError> {
    app.path()
        .app_config_dir()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))
}

impl SettingsState {
    /// The current settings; the first call reads the file (its warning is returned once).
    fn current(&self, dir: &std::path::Path) -> (Settings, Option<ConfigWarning>) {
        let mut cur = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = cur.as_ref() {
            return (c.value.clone(), None);
        }
        let Loaded {
            value,
            warning,
            persist,
        } = settings::load(dir);
        *cur = Some(Current {
            value: value.clone(),
            persist,
        });
        (value, warning)
    }

    /// Replaces the settings by `change(current)` and writes them (unless the file is kept).
    fn change(
        &self,
        dir: &std::path::Path,
        change: impl FnOnce(&Settings) -> Settings,
    ) -> Result<Settings, FsError> {
        self.current(dir);
        let mut cur = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let c = cur.as_mut().expect("loaded above");
        let next = change(&c.value);
        if c.persist {
            settings::save(dir, &next)?;
        }
        c.value = next.clone();
        Ok(next)
    }
}

fn broadcast(app: &AppHandle, window: &WebviewWindow, s: &Settings) {
    let _ = app.emit(
        SETTINGS_CHANGED,
        SettingsChanged {
            settings: s.clone(),
            from: window.label().to_string(),
        },
    );
}

/// Loads the settings at app start and opens the AI bridge if it is on (design 018 E3) – before
/// any window asks, so an AI can connect while the first window starts.
pub fn load_at_start(app: &AppHandle) {
    let Ok(dir) = config_dir(app) else { return };
    let (value, _) = app.state::<SettingsState>().current(&dir);
    crate::mcp_commands::apply(app, &value);
}

/// The settings for a starting window; problems with the file come as a warning.
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<LoadedSettings, FsError> {
    let dir = config_dir(&app)?;
    blocking(move || {
        let (value, warning) = app.state::<SettingsState>().current(&dir);
        crate::mcp_commands::apply(&app, &value);
        Ok(LoadedSettings { value, warning })
    })
    .await
}

/// Lays `patch` (a part of the settings) over the current ones, saves and tells every window.
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    window: WebviewWindow,
    patch: Value,
) -> Result<Settings, FsError> {
    let dir = config_dir(&app)?;
    let handle = app.clone();
    let s = blocking(move || {
        handle
            .state::<SettingsState>()
            .change(&dir, |cur| settings::apply_patch(cur, &patch))
    })
    .await?;
    crate::mcp_commands::apply(&app, &s);
    broadcast(&app, &window, &s);
    Ok(s)
}

/// "Reset to Default": the defaults, saved and sent to every window.
#[tauri::command]
pub async fn reset_settings(app: AppHandle, window: WebviewWindow) -> Result<Settings, FsError> {
    let dir = config_dir(&app)?;
    let handle = app.clone();
    let s = blocking(move || {
        handle
            .state::<SettingsState>()
            .change(&dir, |_| Settings::default())
    })
    .await?;
    crate::mcp_commands::apply(&app, &s);
    broadcast(&app, &window, &s);
    Ok(s)
}

/// Theme of the window frame (`system` | `light` | `dark`, design 015 E15); on Linux and macOS
/// it applies to the whole app.
#[tauri::command]
pub async fn set_window_theme(window: WebviewWindow, theme: String) -> Result<(), FsError> {
    let t = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    window
        .set_theme(t)
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_loads_once_and_keeps_an_unreadable_file() {
        let dir = tempfile::tempdir().unwrap();
        let state = SettingsState::default();
        let (s, w) = state.current(dir.path());
        assert_eq!((s, w), (Settings::default(), None));
        let s = state
            .change(dir.path(), |cur| {
                settings::apply_patch(cur, &serde_json::json!({ "theme": "dark" }))
            })
            .unwrap();
        assert_eq!(s.theme, "dark");
        assert_eq!(settings::load(dir.path()).value.theme, "dark");
        // a second state on a folder in place of the file: never written over
        let bad = tempfile::tempdir().unwrap();
        std::fs::create_dir(bad.path().join(settings::FILE_NAME)).unwrap();
        let other = SettingsState::default();
        assert_eq!(other.current(bad.path()).1.unwrap().code, "unreadable");
        let s = other
            .change(bad.path(), |_| Settings {
                language: "de".into(),
                ..Settings::default()
            })
            .unwrap();
        assert_eq!(s.language, "de", "still applies for this run");
        assert!(bad.path().join(settings::FILE_NAME).is_dir());
    }

    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("settings_commands.rs");
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
        assert_eq!(count, 4);
    }
}
