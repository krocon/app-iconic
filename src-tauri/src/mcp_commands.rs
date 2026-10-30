//! AI control over MCP, the Tauri side (design 018 E3–E5, E16/E17): the bridge for the
//! `app-iconic-mcp` sidecar follows the setting `mcp.enabled` (started and stopped here, never
//! open while it is off), the [`TauriHost`] hands tool calls to the window frontends as the event
//! `mcp-call` and waits for `mcp_reply`. Thin – the rules are in `mcp.rs` and `ai-mcp`.
//! After editlicious `commands.rs` (`mcp_enable`, `mcp_info`, `TauriUi`, design 016).

use crate::error::{FsError, FsErrorCode};
use crate::mcp::{CallResult, Calls, READY_TIMEOUT, Router, WindowHost, err};
use crate::window_commands::{build_document_window, focus};
use crate::windows::DocWindows;
use ai_core::settings::Settings;
use ai_mcp::bridge::{BridgeError, ENDPOINT_ENV, ENDPOINT_FILE};
use ai_mcp::host::{Handler, Host};
use serde::Serialize;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

/// Event to the window that runs a call (payload [`McpCall`]).
pub const MCP_CALL: &str = "mcp-call";
/// Event to every window when the bridge or its connections change (payload [`McpInfo`]).
pub const MCP_STATUS: &str = "mcp-status";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCall {
    pub call_id: u64,
    pub tool: String,
    pub args: Value,
}

/// AI control as the settings dialog shows it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    pub enabled: bool,
    pub connections: usize,
    /// The sidecar next to the app program, `None` = missing (design 018 E17).
    pub sidecar: Option<String>,
}

/// The bridge of the process and the calls in flight.
#[derive(Default)]
pub struct McpState {
    host: Mutex<Option<Host>>,
    pub calls: Arc<Calls>,
    /// The last focused document window (tools without `id`).
    pub active: Arc<Mutex<Option<String>>>,
}

impl McpState {
    pub fn set_active(&self, label: &str) {
        *self.active.lock().unwrap_or_else(|e| e.into_inner()) = Some(label.to_owned());
    }

    /// A window closed: its calls fail, it is no longer the active one.
    pub fn window_gone(&self, label: &str) {
        self.calls.window_gone(label);
        let mut a = self.active.lock().unwrap_or_else(|e| e.into_inner());
        if a.as_deref() == Some(label) {
            *a = None;
        }
    }

    fn connections(&self) -> Option<usize> {
        self.host
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .map(Host::connections)
    }
}

fn is_doc_window(label: &str) -> bool {
    label == "main" || label.starts_with("doc-")
}

/// The windows of the app for the router.
pub struct TauriHost {
    app: AppHandle,
    calls: Arc<Calls>,
    active: Arc<Mutex<Option<String>>>,
}

impl WindowHost for TauriHost {
    fn labels(&self) -> Vec<String> {
        let mut l: Vec<String> = self
            .app
            .webview_windows()
            .into_keys()
            .filter(|l| is_doc_window(l))
            .collect();
        // main first, then doc-1, doc-2 … in their order
        l.sort_by_key(|x| (x != "main", x.len(), x.clone()));
        l
    }

    fn active(&self) -> Option<String> {
        self.active
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    fn call(&self, label: &str, tool: &str, args: Value, timeout: Duration) -> CallResult {
        let window = self
            .app
            .get_webview_window(label)
            .ok_or_else(|| err("unknown_document", format!("no open document {label}")))?;
        if !self.calls.wait_ready(label, READY_TIMEOUT) {
            return Err(err("timeout", "the window is not ready"));
        }
        let (call_id, rx) = self.calls.begin(label);
        let payload = McpCall {
            call_id,
            tool: tool.to_owned(),
            args,
        };
        if let Err(e) = window.emit_to(label, MCP_CALL, payload) {
            self.calls.cancel(call_id);
            return Err(err("io", e.to_string()));
        }
        self.calls.wait(call_id, &rx, timeout)
    }

    fn open_window(&self) -> Result<String, BridgeError> {
        let label = self.app.state::<DocWindows>().new_label(None);
        build_document_window(&self.app, &label).map_err(|e| err("io", e.message))?;
        if !self.calls.wait_ready(&label, READY_TIMEOUT) {
            return Err(err("timeout", "the new window did not start"));
        }
        Ok(label)
    }

    fn focus(&self, label: &str) -> bool {
        *self.active.lock().unwrap_or_else(|e| e.into_inner()) = Some(label.to_owned());
        focus(&self.app, label)
    }

    fn showing(&self, path: &str) -> Option<String> {
        self.app.state::<DocWindows>().showing(path, None)
    }

    fn allow_path(&self, path: &str) {
        self.app
            .state::<ai_core::user_paths::UserPaths>()
            .allow_str([path]);
    }

    fn render(&self, svg: &str, size: u32) -> Result<(String, bool), BridgeError> {
        let fonts = ai_core::export::fonts::system_fonts();
        ai_core::export::png::preview_base64(svg, size, fonts)
            .map_err(|e| BridgeError::new(&code_of(&e), e.message))
    }
}

/// The `snake_case` code of an `FsError`.
pub fn code_of(e: &FsError) -> String {
    serde_json::to_value(e.code)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_else(|| "io".into())
}

/// The bridge's handler: the router, plus the status for every window.
struct Bridge {
    router: Router<TauriHost>,
}

impl Handler for Bridge {
    fn call(&self, tool: &str, args: &Value) -> Result<Value, BridgeError> {
        self.router.call(tool, args)
    }

    fn status(&self, connections: usize) {
        let app = &self.router.host.app;
        let _ = app.emit(MCP_STATUS, info(app, Some(connections)));
    }
}

/// `app-iconic-mcp[.exe]` next to the app program (design 018 E17).
pub fn sidecar_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let p = exe
        .parent()?
        .join(format!("app-iconic-mcp{}", std::env::consts::EXE_SUFFIX));
    p.is_file().then_some(p)
}

fn info(app: &AppHandle, connections: Option<usize>) -> McpInfo {
    let state = app.state::<McpState>();
    let now = state.connections();
    McpInfo {
        enabled: now.is_some(),
        connections: connections.or(now).unwrap_or(0),
        sidecar: sidecar_path().map(|p| p.to_string_lossy().into_owned()),
    }
}

/// The endpoint file: `APP_ICONIC_MCP_ENDPOINT` (tests) or `<app config>/mcp.json`.
fn endpoint_file(app: &AppHandle) -> Result<PathBuf, FsError> {
    if let Some(p) = std::env::var_os(ENDPOINT_ENV).filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(p));
    }
    app.path()
        .app_config_dir()
        .map(|d| d.join(ENDPOINT_FILE))
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))
}

/// Opens or closes the bridge to match the settings (design 018 E3); tells every window.
pub fn apply(app: &AppHandle, settings: &Settings) {
    let state = app.state::<McpState>();
    let changed = {
        let mut host = state.host.lock().unwrap_or_else(|e| e.into_inner());
        match (settings.mcp.enabled, host.is_some()) {
            (true, false) => {
                let started = endpoint_file(app).and_then(|file| {
                    let bridge = Bridge {
                        router: Router::new(TauriHost {
                            app: app.clone(),
                            calls: state.calls.clone(),
                            active: state.active.clone(),
                        }),
                    };
                    Host::start(Arc::new(bridge), &file).map_err(|e| FsError::from_io(&e, &file))
                });
                match started {
                    Ok(h) => *host = Some(h),
                    Err(e) => eprintln!("app-iconic: AI control bridge: {}", e.message),
                }
                true
            }
            // dropping the host closes the port, the connections and removes the file
            (false, true) => {
                *host = None;
                true
            }
            _ => false,
        }
    };
    if changed {
        let _ = app.emit(MCP_STATUS, info(app, None));
    }
}

/// State of AI control for the settings dialog and the status.
#[tauri::command]
pub async fn mcp_info(app: AppHandle) -> Result<McpInfo, FsError> {
    Ok(info(&app, None))
}

/// The calling window has its document and listens for `mcp-call` (design 018 E5).
#[tauri::command]
pub async fn mcp_ready(window: WebviewWindow, state: State<'_, McpState>) -> Result<(), FsError> {
    state.calls.mark_ready(window.label());
    if state
        .active
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_none()
    {
        state.set_active(window.label());
    }
    Ok(())
}

/// The answer of the calling window to call `call_id`.
#[tauri::command]
pub async fn mcp_reply(
    window: WebviewWindow,
    state: State<'_, McpState>,
    call_id: u64,
    result: Option<Value>,
    error: Option<BridgeError>,
) -> Result<(), FsError> {
    let r = match error {
        Some(e) => Err(e),
        None => Ok(result.unwrap_or(json!(null))),
    };
    state.calls.complete(call_id, window.label(), r);
    Ok(())
}

/// "Disconnect AI": closes every connection; the bridge stays open for a new one.
#[tauri::command]
pub async fn mcp_disconnect(app: AppHandle, state: State<'_, McpState>) -> Result<(), FsError> {
    if let Some(h) = state
        .host
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        h.disconnect();
    }
    let _ = app.emit(MCP_STATUS, info(&app, None));
    Ok(())
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn`.
    #[test]
    fn commands_are_async() {
        let src = include_str!("mcp_commands.rs");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_windows_only() {
        assert!(is_doc_window("main") && is_doc_window("doc-12"));
        assert!(!is_doc_window("about"));
    }
}
