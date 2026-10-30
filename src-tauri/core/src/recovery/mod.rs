//! Recovery snapshots (prompt 083): while a document has unsaved changes, the window sends it
//! every few seconds; it is written like saving (`icon::save::assemble`, PNG assets as data URLs –
//! prompt 080) as a bundle into `<app config>/recovery/<id>/snapshot.icon` with a small
//! `meta.json` (original path, format, window, time, process). Never next to the original, never
//! over it.
//!
//! Atomic (design E2): a snapshot is built in a hidden sibling `.<id>.tmp-…`, `meta.json` is
//! written **last**, then the folder is swapped into place (`bundle::swap_into_place`). Only a
//! folder named like an id with a readable `meta.json` and a `snapshot.icon` counts – a write
//! that stopped half-way leaves nothing that is listed, and [`prune`] removes the leftovers of
//! instances that are gone. Ownership (other windows, other processes) is in [`instance`].
//!
//! The WebView never sees a path of this folder – only ids (design E1).

pub mod instance;

pub use instance::{Instance, alive, instance_of, is_valid_id};

use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use crate::icon::bundle::{read_bundle, read_limited, sibling, swap_into_place, write_bundle};
use crate::icon::{IconFile, IconFormat, Limits};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// Folder in the app config directory.
pub const DIR_NAME: &str = "recovery";
/// The snapshot's description, written last.
pub const META_FILE: &str = "meta.json";
/// The document inside a snapshot folder (always a bundle).
pub const ICON_DIR: &str = "snapshot.icon";
/// Largest document kept as a snapshot (the whole of a `.icon` we read, `Limits::max_total`).
pub const MAX_BYTES: u64 = 256 * 1024 * 1024;
/// Largest `meta.json` read.
const META_MAX: u64 = 64 * 1024;
const META_VERSION: u32 = 1;

/// `meta.json` of a snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub version: u32,
    /// The snapshot id (= folder name).
    pub id: String,
    /// The document's file; `None` for one never saved.
    pub path: Option<String>,
    /// The document's own format (the snapshot itself is a bundle).
    pub format: IconFormat,
    /// Label of the window it came from (information only).
    pub window: String,
    /// Milliseconds since 1970 (UTC).
    pub saved_at: u64,
    /// Process id of the writer (information only – ownership is the lock, [`instance`]).
    pub pid: u32,
}

impl Meta {
    pub fn new(id: String, path: Option<String>, format: IconFormat, window: String) -> Self {
        Self {
            version: META_VERSION,
            id,
            path,
            format,
            window,
            saved_at: now_ms(),
            pid: std::process::id(),
        }
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

fn gone(id: &str) -> FsError {
    FsError::new(
        FsErrorCode::RecoveryUnavailable,
        format!("no recovery snapshot {id:?} to take"),
        None,
    )
}

fn bad_id(id: &str) -> FsError {
    FsError::new(
        FsErrorCode::InvalidRequest,
        format!("invalid recovery id {id:?}"),
        None,
    )
}

/// Bytes the document takes on disk.
fn size_of(file: &IconFile) -> u64 {
    file.json_bytes.len() as u64
        + file
            .assets
            .iter()
            .map(|a| a.bytes.len() as u64)
            .sum::<u64>()
        + file
            .extra_files
            .iter()
            .map(|e| e.bytes.len() as u64)
            .sum::<u64>()
}

fn write_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut f = fs::File::create(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

/// Writes the snapshot `meta.id` atomically into `dir` (replacing the older one of that id).
pub fn write(dir: &Path, meta: &Meta, file: IconFile) -> Result<(), FsError> {
    write_with(dir, meta, file, || Ok(()))
}

/// [`write`] with a hook right before `meta.json` (tests stop the write there).
pub(crate) fn write_with(
    dir: &Path,
    meta: &Meta,
    mut file: IconFile,
    before_meta: impl FnOnce() -> io::Result<()>,
) -> Result<(), FsError> {
    if !is_valid_id(&meta.id) {
        return Err(bad_id(&meta.id));
    }
    let size = size_of(&file);
    if size > MAX_BYTES {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            format!("snapshot of {size} bytes, limit {MAX_BYTES}"),
            None,
        ));
    }
    file.format = IconFormat::Bundle;
    let target = dir.join(&meta.id);
    let io_err = |e: io::Error| FsError::from_io(&e, &target);
    fs::create_dir_all(dir).map_err(io_err)?;
    let tmp = sibling(&target, "tmp").map_err(io_err)?;
    let json = serde_json::to_vec_pretty(meta)
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    let built = (|| {
        fs::create_dir(&tmp).map_err(io_err)?;
        write_bundle(&tmp.join(ICON_DIR), &file)?;
        before_meta().map_err(io_err)?;
        write_file(&tmp.join(META_FILE), &json).map_err(io_err)?;
        swap_into_place(&tmp, &target).map_err(io_err)
    })();
    if built.is_err() {
        let _ = fs::remove_dir_all(&tmp);
    }
    built
}

/// The `meta.json` of folder `dir/<id>`, if it is a complete snapshot.
pub fn read_meta(dir: &Path, id: &str) -> Option<Meta> {
    if !is_valid_id(id) {
        return None;
    }
    let folder = dir.join(id);
    let f = fs::File::open(folder.join(META_FILE)).ok()?;
    let bytes = read_limited(f, META_MAX).ok()??;
    let meta: Meta = serde_json::from_slice(&bytes).ok()?;
    let complete = meta.id == id && folder.join(ICON_DIR).join("icon.json").is_file();
    complete.then_some(meta)
}

/// The snapshots of instances that are gone (not `own`), newest first – what the start offers.
pub fn list(dir: &Path, own: Option<&str>) -> Vec<Meta> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<Meta> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let inst = instance_of(&name)?;
            if alive(dir, inst, own) {
                return None;
            }
            read_meta(dir, &name)
        })
        .collect();
    out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at).then_with(|| a.id.cmp(&b.id)));
    out
}

/// Reads snapshot `id` (bundle with the usual limits); the file has the document's format again.
pub fn read(dir: &Path, id: &str) -> Result<(Meta, IconFile), FsError> {
    let meta = read_meta(dir, id).ok_or_else(|| gone(id))?;
    let mut file = read_bundle(&dir.join(id).join(ICON_DIR), &Limits::default())?;
    file.format = meta.format;
    Ok((meta, file))
}

/// Takes over the snapshot `id` of an instance that is gone (design E6): renamed to a new id of
/// `me` (one rename – a second window or process taking it at the same time gets
/// `recovery_unavailable`), so it keeps protecting the restored document until it is saved.
pub fn adopt(me: &Instance, id: &str) -> Result<(Meta, IconFile), FsError> {
    let dir = me.dir();
    let inst = instance_of(id).ok_or_else(|| bad_id(id))?;
    if alive(dir, inst, Some(me.id())) {
        return Err(gone(id));
    }
    let mut meta = read_meta(dir, id).ok_or_else(|| gone(id))?;
    let new_id = me.next_id();
    let to = dir.join(&new_id);
    fs::rename(dir.join(id), &to).map_err(|_| gone(id))?;
    meta.id = new_id.clone();
    let json = serde_json::to_vec_pretty(&meta)
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    if let Err(e) = write_atomic(&to.join(META_FILE), &json) {
        let _ = fs::rename(&to, dir.join(id));
        return Err(FsError::from_io(&e, &to));
    }
    read(dir, &new_id)
}

/// Removes snapshot `id`; `false` if there was none.
pub fn discard(dir: &Path, id: &str) -> Result<bool, FsError> {
    if !is_valid_id(id) {
        return Err(bad_id(id));
    }
    let folder = dir.join(id);
    match fs::remove_dir_all(&folder) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(FsError::from_io(&e, &folder)),
    }
}

/// The instance an entry of the recovery folder belongs to: a snapshot `<id>`, a leftover
/// `.<id>.tmp-…` / `.<id>.old-…`, or `None` for anything that is not ours.
fn entry_instance(name: &str) -> Option<&str> {
    if let Some(inst) = instance_of(name) {
        return Some(inst);
    }
    let rest = name.strip_prefix('.')?;
    let (id, tail) = rest.split_once('.')?;
    (tail.starts_with("tmp-") || tail.starts_with("old-"))
        .then(|| instance_of(id))
        .flatten()
}

fn remove_any(path: &Path) -> bool {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(path).is_ok(),
        Ok(_) => fs::remove_file(path).is_ok(),
        Err(_) => false,
    }
}

/// Every snapshot and leftover of `instance` (regular exit of that instance).
pub(crate) fn remove_instance_entries(dir: &Path, instance: &str) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|e| entry_instance(&e.file_name().to_string_lossy()) == Some(instance))
        .filter(|e| remove_any(&e.path()))
        .count()
}

/// Cleans up after instances that are gone (not `own`, design E7): half-written leftovers,
/// snapshot folders without a complete `meta.json`, lock files. Complete snapshots stay – they
/// are offered. Anything that is not ours stays. Returns how many entries were removed.
pub fn prune(dir: &Path, own: Option<&str>) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let remove = if let Some(inst) = instance::lock_owner(&name) {
            !alive(dir, inst, own)
        } else if let Some(inst) = entry_instance(&name) {
            !alive(dir, inst, own) && (name.starts_with('.') || read_meta(dir, &name).is_none())
        } else {
            false
        };
        if remove && remove_any(&e.path()) {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests;
