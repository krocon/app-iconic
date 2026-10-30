//! The recently used symbols of every set (prompt 084, design E10): `<app config>/symbols/recent.json`,
//! `{ "version": 1, "items": [{ "set": "tabler", "id": "star" }] }`, newest first, at most
//! [`MAX_RECENT`], no duplicates. Shared by every window (unlike a WebView store). Loaded through
//! [`crate::config_file`] (missing → empty, broken → empty + `.bad`).

use crate::config_file::{Loaded, read_config};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Entries kept (three rows of the picker).
pub const MAX_RECENT: usize = 24;
/// File name in the symbols folder (no `.svg`: never taken for a symbol).
pub const FILE_NAME: &str = "recent.json";
const VERSION: u32 = 1;
const MAX_BYTES: u64 = 64 * 1024;

/// A symbol of a set (`lucide`, `tabler`, `phosphor`, `mine`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolRef {
    pub set: String,
    pub id: String,
}

#[derive(Serialize, Deserialize)]
struct RecentFile {
    version: u32,
    items: Vec<SymbolRef>,
}

/// A set id: `[a-z0-9-]`, 1…32; a symbol id: `[A-Za-z0-9_.-]`, 1…128 (the ids of the sets).
pub fn usable(r: &SymbolRef) -> bool {
    let set_ok = (1..=32).contains(&r.set.len())
        && r.set
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    let id_ok = (1..=128).contains(&r.id.len())
        && r.id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'));
    set_ok && id_ok
}

fn clean<'a>(items: impl IntoIterator<Item = &'a SymbolRef>) -> Vec<SymbolRef> {
    let mut out: Vec<SymbolRef> = Vec::new();
    for r in items {
        if usable(r) && !out.contains(r) {
            out.push(r.clone());
        }
        if out.len() == MAX_RECENT {
            break;
        }
    }
    out
}

/// Reads the list; a file of another version counts as broken.
pub fn load(file: &Path) -> Loaded<Vec<SymbolRef>> {
    read_config(file, MAX_BYTES, Vec::new, |text| {
        let r: RecentFile = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if r.version != VERSION {
            return Err(format!("unknown version {}", r.version));
        }
        Ok(clean(&r.items))
    })
}

fn save(file: &Path, items: &[SymbolRef]) -> Result<(), FsError> {
    let body = RecentFile {
        version: VERSION,
        items: clean(items),
    };
    let text = serde_json::to_string_pretty(&body)
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    write_atomic(file, text.as_bytes()).map_err(|e| FsError::from_io(&e, file))
}

/// Puts `r` in front and returns the new list (unchanged when the file could not be read).
pub fn record(file: &Path, r: SymbolRef) -> Result<Vec<SymbolRef>, FsError> {
    if !usable(&r) {
        return Err(FsError::new(
            FsErrorCode::InvalidRequest,
            "not a symbol of a set",
            None,
        ));
    }
    let loaded = load(file);
    let list = clean(std::iter::once(&r).chain(loaded.value.iter()));
    if loaded.persist {
        save(file, &list)?;
    }
    Ok(list)
}

/// Removes every entry of `set`/`id` (a deleted own symbol).
pub fn forget(file: &Path, set: &str, id: &str) -> Result<(), FsError> {
    let loaded = load(file);
    if !loaded.persist || !loaded.value.iter().any(|r| r.set == set && r.id == id) {
        return Ok(());
    }
    let list: Vec<SymbolRef> = loaded
        .value
        .into_iter()
        .filter(|r| !(r.set == set && r.id == id))
        .collect();
    save(file, &list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn r(set: &str, id: &str) -> SymbolRef {
        SymbolRef {
            set: set.into(),
            id: id.into(),
        }
    }

    #[test]
    fn newest_first_without_duplicates_and_bounded() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("symbols").join(FILE_NAME);
        assert!(load(&file).value.is_empty());
        record(&file, r("lucide", "heart")).unwrap();
        record(&file, r("tabler", "star")).unwrap();
        let list = record(&file, r("lucide", "heart")).unwrap();
        assert_eq!(list, vec![r("lucide", "heart"), r("tabler", "star")]);
        for i in 0..40 {
            record(&file, r("phosphor", &format!("i{i}"))).unwrap();
        }
        let list = load(&file).value;
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(list[0], r("phosphor", "i39"));
        forget(&file, "phosphor", "i39").unwrap();
        assert_eq!(load(&file).value[0], r("phosphor", "i38"));
    }

    #[test]
    fn refuses_odd_refs_and_survives_a_broken_file() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(FILE_NAME);
        for bad in [
            r("", "x"),
            r("Lucide", "x"),
            r("a", ""),
            r("a", "../x"),
            r("a", "x/y"),
        ] {
            assert_eq!(
                record(&file, bad).unwrap_err().code,
                FsErrorCode::InvalidRequest
            );
        }
        std::fs::write(&file, "{ nope").unwrap();
        assert!(load(&file).value.is_empty());
        assert_eq!(
            record(&file, r("mine", "star")).unwrap(),
            vec![r("mine", "star")]
        );
        // odd entries in the file are dropped on reading
        std::fs::write(
            &file,
            r#"{"version":1,"items":[{"set":"a","id":"../../x"},{"set":"a","id":"ok"}]}"#,
        )
        .unwrap();
        assert_eq!(load(&file).value, vec![r("a", "ok")]);
    }
}
