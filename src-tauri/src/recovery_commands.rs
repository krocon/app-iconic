//! Recovery snapshots of unsaved documents (prompt 083, design E1–E8). The folder
//! `<app config>/recovery/` is computed here and never leaves Rust: the WebView names snapshots
//! by id. This process is one `ai_core::recovery::Instance` (lock file, taken on the first
//! snapshot); a window may only write or discard ids of this instance – or discard / take over
//! ids of an instance that is gone. On a regular exit every snapshot of this instance goes
//! ([`release`]).

use crate::commands::{allowed, asset_inputs, blocking, config_dir};
use crate::error::{FsError, FsErrorCode};
use crate::model::{IconDocumentDto, RecoveredDto, RecoveryEntryDto, SaveAssetDto};
use crate::sessions::IconSessions;
use ai_core::icon::IconFormat;
use ai_core::icon::save::assemble;
use ai_core::recent;
use ai_core::recovery::{self, Instance, Meta};
use ai_core::user_paths::UserPaths;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State, WebviewWindow};

/// This process in the recovery folder (taken lazily) and whether the start offer was made.
#[derive(Default)]
pub struct RecoveryState {
    instance: Mutex<Option<Arc<Instance>>>,
    offered: AtomicBool,
}

impl RecoveryState {
    fn current(&self) -> Option<Arc<Instance>> {
        self.instance
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    fn own_id(&self) -> Option<String> {
        self.current().map(|i| i.id().to_owned())
    }

    /// The instance, created (lock file) on first use.
    fn instance(&self, dir: &std::path::Path) -> Result<Arc<Instance>, FsError> {
        let mut slot = self.instance.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(i) = slot.as_ref() {
            return Ok(i.clone());
        }
        let i = Arc::new(Instance::acquire(dir)?);
        *slot = Some(i.clone());
        Ok(i)
    }

    /// The start offer is made once per process (the first window, design E5).
    fn first_offer(&self) -> bool {
        !self.offered.swap(true, Ordering::SeqCst)
    }
}

fn recovery_dir(app: &AppHandle) -> Result<PathBuf, FsError> {
    config_dir(app).map(|d| d.join(recovery::DIR_NAME))
}

fn not_ours(id: &str) -> FsError {
    FsError::new(
        FsErrorCode::NotAllowed,
        format!("recovery snapshot {id:?} belongs to another window or process"),
        None,
    )
}

/// Writes the snapshot of the calling window's document (like `save_icon`: unchanged assets from
/// the session of `from` / `path`). `id`: the snapshot to replace (one of this instance), `None`
/// for a new one. Returns the id.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn write_recovery(
    app: AppHandle,
    window: WebviewWindow,
    sessions: State<'_, IconSessions>,
    paths: State<'_, UserPaths>,
    id: Option<String>,
    path: Option<String>,
    from: Option<String>,
    format: IconFormat,
    icon_json: Value,
    assets: Vec<SaveAssetDto>,
) -> Result<String, FsError> {
    // the path is kept in the snapshot and granted again on restore: only a trusted one
    if let Some(p) = &path {
        allowed(&paths, p)?;
    }
    let dir = recovery_dir(&app)?;
    let me = app.state::<RecoveryState>().instance(&dir)?;
    let id = match id {
        Some(id) if me.owns(&id) => id,
        Some(id) => return Err(not_ours(&id)),
        None => me.next_id(),
    };
    let base = from
        .as_deref()
        .or(path.as_deref())
        .and_then(|p| sessions.get(p));
    let meta = Meta::new(id.clone(), path, format, window.label().to_owned());
    let inputs = asset_inputs(assets);
    blocking(move || {
        let file = assemble(base.as_deref(), format, icon_json, inputs, &dir)?;
        recovery::write(&dir, &meta, file)
    })
    .await?;
    Ok(id)
}

/// The snapshots of instances that are gone, newest first. `at_start`: the offer at start – only
/// the first window of this process gets the list, later ones an empty one (design E5).
#[tauri::command]
pub async fn list_recovery(
    app: AppHandle,
    at_start: bool,
) -> Result<Vec<RecoveryEntryDto>, FsError> {
    let state = app.state::<RecoveryState>();
    if at_start && !state.first_offer() {
        return Ok(Vec::new());
    }
    let own = state.own_id();
    let dir = recovery_dir(&app)?;
    blocking(move || {
        recovery::prune(&dir, own.as_deref());
        Ok(recovery::list(&dir, own.as_deref())
            .into_iter()
            .map(|m| RecoveryEntryDto {
                name: m.path.as_deref().map(recent::display_name),
                location: m.path.as_deref().map(recent::display_dir),
                id: m.id,
                path: m.path,
                saved_at: m.saved_at,
            })
            .collect())
    })
    .await
}

/// Restores snapshot `id` (of an instance that is gone): it becomes a snapshot of this instance
/// under a new id, the document opens with its original path. That path was an open document of
/// the user, so it is trusted again (design E6); its snapshot becomes the session unless the
/// file is open in another window.
#[tauri::command]
pub async fn open_recovery(
    app: AppHandle,
    sessions: State<'_, IconSessions>,
    paths: State<'_, UserPaths>,
    id: String,
) -> Result<RecoveredDto, FsError> {
    let dir = recovery_dir(&app)?;
    let me = app.state::<RecoveryState>().instance(&dir)?;
    let (meta, file) = blocking(move || recovery::adopt(&me, &id)).await?;
    if let Some(p) = &meta.path {
        paths.allow_str([p.as_str()]);
        if sessions.get(p).is_none() {
            sessions.put(p, file.clone());
        }
    }
    Ok(RecoveredDto {
        document: IconDocumentDto::from_file(meta.path.clone(), &file),
        id: meta.id,
    })
}

/// Removes snapshot `id` – one of this instance (saved, "Don't Save", another document) or one
/// of an instance that is gone ("Discard" in the offer). `false` if there was none.
#[tauri::command]
pub async fn discard_recovery(app: AppHandle, id: String) -> Result<bool, FsError> {
    let dir = recovery_dir(&app)?;
    let own = app.state::<RecoveryState>().own_id();
    let inst = recovery::instance_of(&id)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidRequest, "invalid recovery id", None))?;
    if own.as_deref() != Some(inst) && recovery::alive(&dir, inst, own.as_deref()) {
        return Err(not_ours(&id));
    }
    blocking(move || recovery::discard(&dir, &id)).await
}

/// Regular exit (design E8): every snapshot of this instance and its lock file go.
pub fn release(app: &AppHandle) {
    let state = app.state::<RecoveryState>();
    let taken = state
        .instance
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();
    if let Some(i) = taken {
        i.release();
    }
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("recovery_commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let mut next = lines.next().unwrap_or_default().trim();
                while next.starts_with("#[") {
                    next = lines.next().unwrap_or_default().trim();
                }
                assert!(next.starts_with("pub async fn"), "synchronous: {next}");
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
    fn the_start_offer_is_made_once_and_the_instance_lazily() {
        let s = RecoveryState::default();
        assert!(s.first_offer());
        assert!(!s.first_offer());
        assert_eq!(s.own_id(), None, "no lock file before the first snapshot");
        let dir = tempfile::tempdir().unwrap();
        let a = s.instance(dir.path()).unwrap();
        let b = s.instance(dir.path()).unwrap();
        assert_eq!(a.id(), b.id());
        assert_eq!(s.own_id().as_deref(), Some(a.id()));
    }
}
