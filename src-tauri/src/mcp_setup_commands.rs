//! Setting up AI clients and the connection test (prompt 086): thin commands over
//! `ai_core::mcp_clients` and `ai_mcp::probe`. The WebView names a **target** only – the paths are
//! computed here from a fixed list (design 086 E1); the sidecar is the one next to the app
//! program (E6, `mcp_commands::sidecar_path`).

use crate::commands::blocking;
use crate::error::{FsError, FsErrorCode};
use crate::mcp_commands::sidecar_path;
use ai_core::mcp_clients::{self, ClientState, Dirs, McpClient};
use ai_mcp::probe::{Probe, probe};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Time limit of each step of the connection test (design 086 E8).
const PROBE_STEP: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpClientStatus {
    pub target: McpClient,
    /// Where the configuration is (for display only).
    pub path: String,
    pub state: ClientState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSetupPlan {
    pub target: McpClient,
    pub path: String,
    /// The file now (`None` = there is none).
    pub before: Option<String>,
    /// The file after “Apply” (`None` = nothing to change).
    pub after: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSetupDone {
    pub path: String,
    pub backup: Option<String>,
}

fn dirs(app: &AppHandle) -> Result<Dirs, FsError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    let appdata = if cfg!(windows) {
        std::env::var_os("APPDATA")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    } else {
        None
    };
    Ok(Dirs { home, appdata })
}

fn config_path(app: &AppHandle, target: McpClient) -> Result<PathBuf, FsError> {
    Ok(mcp_clients::config_path(
        target,
        mcp_clients::current_os(),
        &dirs(app)?,
    ))
}

fn sidecar() -> Result<String, FsError> {
    sidecar_path()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| {
            FsError::new(
                FsErrorCode::SidecarMissing,
                "app-iconic-mcp is not next to the app program",
                None,
            )
        })
}

fn display(p: &std::path::Path) -> String {
    p.to_string_lossy().into_owned()
}

/// Each target with its configuration file and what it says about our entry (design 086 E7).
#[tauri::command]
pub async fn mcp_clients(app: AppHandle) -> Result<Vec<McpClientStatus>, FsError> {
    let paths: Vec<(McpClient, PathBuf)> = McpClient::ALL
        .iter()
        .map(|&t| config_path(&app, t).map(|p| (t, p)))
        .collect::<Result<_, _>>()?;
    blocking(move || {
        let side = sidecar_path().map(|p| display(&p));
        Ok(paths
            .into_iter()
            .map(|(target, path)| {
                let state = match mcp_clients::read(&path) {
                    Ok(text) => mcp_clients::state(text.as_deref(), side.as_deref()),
                    Err(_) => ClientState::Invalid,
                };
                McpClientStatus {
                    target,
                    path: display(&path),
                    state,
                }
            })
            .collect())
    })
    .await
}

/// What “Set up” (`remove: false`) or “Remove” would write – shown as a diff before (E4).
#[tauri::command]
pub async fn mcp_setup_preview(
    app: AppHandle,
    target: McpClient,
    remove: bool,
) -> Result<McpSetupPlan, FsError> {
    let path = config_path(&app, target)?;
    blocking(move || {
        let before = mcp_clients::read(&path)?;
        let after = if remove {
            mcp_clients::removed(before.as_deref())?
        } else {
            mcp_clients::merged(before.as_deref(), target, &sidecar()?)?
        };
        Ok(McpSetupPlan {
            target,
            path: display(&path),
            before,
            after,
        })
    })
    .await
}

fn apply(
    path: PathBuf,
    expected: Option<String>,
    after: Option<String>,
) -> Result<McpSetupDone, FsError> {
    let backup = match after {
        Some(text) => mcp_clients::write(&path, expected.as_deref(), &text)?,
        None => None,
    };
    Ok(McpSetupDone {
        path: display(&path),
        backup: backup.map(|b| display(&b)),
    })
}

/// Writes the `app-iconic` entry after the user confirmed the preview; `expected` = the file the
/// preview showed (else `config_changed`).
#[tauri::command]
pub async fn mcp_install(
    app: AppHandle,
    target: McpClient,
    expected: Option<String>,
) -> Result<McpSetupDone, FsError> {
    let path = config_path(&app, target)?;
    blocking(move || {
        let side = sidecar()?;
        let now = mcp_clients::read(&path)?;
        if now != expected {
            return Err(FsError::new(
                FsErrorCode::ConfigChanged,
                "the configuration changed since the preview",
                Some(&path),
            ));
        }
        let after = mcp_clients::merged(now.as_deref(), target, &side)?;
        apply(path, expected, after)
    })
    .await
}

/// Removes the `app-iconic` entry after the user confirmed the preview.
#[tauri::command]
pub async fn mcp_uninstall(
    app: AppHandle,
    target: McpClient,
    expected: Option<String>,
) -> Result<McpSetupDone, FsError> {
    let path = config_path(&app, target)?;
    blocking(move || {
        let now = mcp_clients::read(&path)?;
        let after = mcp_clients::removed(now.as_deref())?;
        apply(path, expected, after)
    })
    .await
}

/// Starts the sidecar and runs the MCP handshake plus one call to the app (E8).
#[tauri::command]
pub async fn mcp_test() -> Result<Probe, FsError> {
    let program = sidecar_path().ok_or_else(|| {
        FsError::new(
            FsErrorCode::SidecarMissing,
            "app-iconic-mcp is not next to the app program",
            None,
        )
    })?;
    blocking(move || Ok(probe(&program, PROBE_STEP))).await
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn`, and none takes a path (E1).
    #[test]
    fn commands_are_async_and_take_no_path() {
        let src = include_str!("mcp_setup_commands.rs");
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
        // the parameters of every command: only the app handle, a target and texts (E1)
        for (at, _) in src.match_indices("\n#[tauri::command]\n") {
            let sig = &src[at..at + src[at..].find(") ->").expect("signature")];
            for bad in ["path", "dir", "PathBuf", "&str"] {
                assert!(!sig.contains(bad), "a command takes a path: {sig}");
            }
        }
    }
}
