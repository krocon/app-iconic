//! Recently used `.icon` files (design 003 E12, legacy §4 "Open Recent"): `recent.json` in the app
//! config directory, `{ "version": 1, "files": [...] }`, newest first, at most [`MAX_RECENT`],
//! no duplicates, absolute paths only. Loaded through [`crate::config_file`] (missing → empty,
//! broken → empty + `.bad`).

use crate::config_file::{Loaded, read_config};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Entries kept (legacy: the system's recent menu, typically 10).
pub const MAX_RECENT: usize = 10;
/// File name in the app config directory.
pub const FILE_NAME: &str = "recent.json";
const VERSION: u32 = 1;
const MAX_BYTES: u64 = 64 * 1024;

#[derive(Serialize, Deserialize)]
struct RecentFile {
    version: u32,
    files: Vec<String>,
}

fn usable(path: &str) -> bool {
    !path.is_empty() && Path::new(path).is_absolute() && !path.contains('\0')
}

/// Absolute, non-empty, first occurrence only, at most [`MAX_RECENT`].
fn clean<'a>(files: impl IntoIterator<Item = &'a String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for f in files {
        if usable(f) && !out.contains(f) {
            out.push(f.clone());
        }
        if out.len() == MAX_RECENT {
            break;
        }
    }
    out
}

/// Reads `recent.json`; a file of another version is treated as broken (kept as `.bad`).
pub fn load(file: &Path) -> Loaded<Vec<String>> {
    read_config(file, MAX_BYTES, Vec::new, |text| {
        let r: RecentFile = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if r.version != VERSION {
            return Err(format!("unknown version {}", r.version));
        }
        Ok(clean(&r.files))
    })
}

/// Writes the list atomically; creates the config directory if needed.
pub fn save(file: &Path, files: &[String]) -> Result<(), FsError> {
    let io = |e: std::io::Error| FsError::from_io(&e, file);
    let body = RecentFile {
        version: VERSION,
        files: clean(files),
    };
    let bytes = serde_json::to_vec_pretty(&body)
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), Some(file)))?;
    write_atomic(file, &bytes).map_err(io)
}

/// `path` to the front; entries whose file is gone are dropped.
pub fn add(files: &[String], path: &str, exists: impl Fn(&str) -> bool) -> Vec<String> {
    let rest = files.iter().filter(|f| f.as_str() != path && exists(f));
    let first = path.to_owned();
    clean(std::iter::once(&first).chain(rest))
}

/// The entries whose file still exists (shown in the menu; the file keeps the others).
pub fn existing(files: &[String], exists: impl Fn(&str) -> bool) -> Vec<String> {
    files.iter().filter(|f| exists(f)).cloned().collect()
}

/// The name shown for a path: its last component (the path itself if it has none).
pub fn display_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn abs(name: &str) -> String {
        std::env::temp_dir()
            .join(name)
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn missing_file_is_an_empty_list_and_saving_round_trips() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("sub").join(FILE_NAME);
        let l = load(&file);
        assert!(l.value.is_empty() && l.warning.is_none() && l.persist);
        let list = vec![abs("a.icon"), abs("b ü.icon")];
        save(&file, &list).unwrap();
        assert_eq!(load(&file).value, list);
        let text = fs::read_to_string(&file).unwrap();
        assert!(text.contains("\"version\": 1"), "{text}");
    }

    #[test]
    fn broken_or_foreign_files_become_empty_and_are_kept_aside() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(FILE_NAME);
        for text in [
            "{",
            "[]",
            r#"{"version":2,"files":[]}"#,
            r#"{"files":["/a"]}"#,
        ] {
            fs::write(&file, text).unwrap();
            let l = load(&file);
            assert!(l.value.is_empty(), "{text}");
            assert_eq!(l.warning.unwrap().code, "broken", "{text}");
            assert!(dir.path().join("recent.json.bad").exists());
        }
    }

    #[test]
    fn load_drops_relative_empty_and_duplicate_paths_and_keeps_ten() {
        let dir = tempdir().unwrap();
        let file = dir.path().join(FILE_NAME);
        let mut files: Vec<String> =
            vec!["".into(), "rel.icon".into(), abs("x.icon"), abs("x.icon")];
        files.extend((0..20).map(|i| abs(&format!("{i}.icon"))));
        let json = serde_json::json!({ "version": 1, "files": files });
        fs::write(&file, json.to_string()).unwrap();
        let got = load(&file).value;
        assert_eq!(got.len(), MAX_RECENT);
        assert_eq!(got[0], abs("x.icon"));
        assert_eq!(got[1], abs("0.icon"));
    }

    #[test]
    fn add_moves_to_the_front_drops_missing_and_limits() {
        let all = |_: &str| true;
        let list: Vec<String> = (0..MAX_RECENT).map(|i| abs(&format!("{i}"))).collect();
        let got = add(&list, &abs("5"), all);
        assert_eq!(got[0], abs("5"));
        assert_eq!(got.len(), MAX_RECENT);
        assert_eq!(got.iter().filter(|p| **p == abs("5")).count(), 1);
        let got = add(&list, &abs("new"), all);
        assert_eq!(got.len(), MAX_RECENT);
        assert_eq!(got[0], abs("new"));
        assert!(!got.contains(&abs("9")), "the oldest falls out");
        let gone = abs("3");
        let got = add(&list, &abs("new"), |p| p != gone);
        assert!(!got.contains(&gone));
        assert!(got.contains(&abs("9")));
    }

    #[test]
    fn existing_filters_missing_files() {
        let dir = tempdir().unwrap();
        let here = dir.path().join("a.icon");
        fs::create_dir(&here).unwrap();
        let here = here.to_string_lossy().into_owned();
        let gone = dir.path().join("gone.icon").to_string_lossy().into_owned();
        let list = vec![gone, here.clone()];
        assert_eq!(existing(&list, |p| Path::new(p).exists()), vec![here]);
    }

    #[test]
    fn display_names() {
        assert_eq!(display_name(&abs("Mein Icon.icon")), "Mein Icon.icon");
        assert_eq!(display_name("/"), "/");
    }
}
