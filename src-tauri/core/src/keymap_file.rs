//! Übernommen aus editlicious `src-tauri/src/keymap_file.rs` (Prompt 005, dort aus comic-commander
//! Design 008 E2).
//!
//! The user's shortcut overrides (design 005 E14): `<app config>/keymap.json`
//! `{ "version": 1, "bindings": { "<action id>": ["Mod+Shift+X", …] } }`. Loaded with the shared
//! config loader (missing → none, broken → kept as `.bad` + warning); every entry is checked –
//! bad ids and chords that are no text (empty, > 40 bytes, control characters) are dropped.
//! Unknown action ids and the chord syntax (`Cmd`, `Control`, any order) are the frontend's
//! business – it knows the catalogue and normalises (one parser, not two).
//!
//! Since prompt 085 the shortcut editor writes it too ([`save`]): the frontend sends a patch per
//! action (its chords, or `null` = back to the built-in ones), so the file only ever holds the
//! deviations; every other field and entry (unknown actions, own notes) stays as it was.

use crate::config_file::{ConfigWarning, read_config};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::{keep_broken_file, write_atomic};
use crate::menu_spec::valid_id;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::io::{self, Read};
use std::path::Path;

pub const FILE_NAME: &str = "keymap.json";
const MAX_FILE: u64 = 64 << 10;
const MAX_ACTIONS: usize = 500;
const MAX_CHORDS: usize = 8;
/// Entries of one patch: every action of the catalogue (≈ 300) fits.
const MAX_CHANGES: usize = 1000;

/// A patch of `bindings` (design 085 E2): action id → its chords, `None` = remove the entry.
pub type KeymapChanges = BTreeMap<String, Option<Vec<String>>>;

#[derive(Debug, Clone, Default, Deserialize)]
struct File {
    #[serde(default)]
    bindings: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapOverrides {
    pub bindings: BTreeMap<String, Vec<String>>,
    pub warning: Option<ConfigWarning>,
}

/// A chord is plain text of reasonable length; its syntax is checked by `normalizeChord` (TS).
fn chord_text(c: &str) -> bool {
    !c.is_empty() && c.len() <= 40 && !c.chars().any(char::is_control)
}

pub fn load(config_dir: &Path) -> KeymapOverrides {
    let loaded = read_config(
        &config_dir.join(FILE_NAME),
        MAX_FILE,
        File::default,
        |text| serde_json::from_str::<File>(text).map_err(|e| e.to_string()),
    );
    let bindings = loaded
        .value
        .bindings
        .into_iter()
        .filter(|(id, _)| valid_id(id))
        .take(MAX_ACTIONS)
        .map(|(id, chords)| {
            let chords: Vec<String> = chords
                .into_iter()
                .filter(|c| chord_text(c))
                .take(MAX_CHORDS)
                .collect();
            (id, chords)
        })
        .collect();
    KeymapOverrides {
        bindings,
        warning: loaded.warning,
    }
}

fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidKeymap, message, None)
}

/// The patch is plain data from the WebView: ids like menu ids, chords as when loading.
fn check(changes: &KeymapChanges) -> Result<(), FsError> {
    if changes.len() > MAX_CHANGES {
        return Err(invalid("too many entries"));
    }
    for (id, chords) in changes {
        if !valid_id(id) {
            return Err(invalid(format!("bad action id {id:?}")));
        }
        if let Some(c) = chords
            && (c.len() > MAX_CHORDS || !c.iter().all(|c| chord_text(c)))
        {
            return Err(invalid(format!("bad shortcuts for {id}")));
        }
    }
    Ok(())
}

/// The file as a JSON object: missing → new, broken → kept as `.bad` and new (as when
/// loading), unreadable → error (it is not written over).
fn read_object(file: &Path) -> Result<Map<String, Value>, FsError> {
    let fresh = || {
        let mut m = Map::new();
        m.insert("version".into(), Value::from(1));
        m
    };
    let mut bytes = Vec::new();
    match std::fs::File::open(file).and_then(|f| f.take(MAX_FILE + 1).read_to_end(&mut bytes)) {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(fresh()),
        Err(e) => return Err(FsError::from_io(&e, file)),
    }
    let parsed = (bytes.len() as u64 <= MAX_FILE)
        .then(|| serde_json::from_slice::<Value>(&bytes).ok())
        .flatten();
    match parsed {
        Some(Value::Object(m)) => Ok(m),
        _ => {
            if keep_broken_file(file).is_none() {
                return Err(FsError::new(
                    FsErrorCode::Io,
                    "broken keymap.json could not be moved aside",
                    Some(file),
                ));
            }
            Ok(fresh())
        }
    }
}

/// Applies `changes` to `<config_dir>/keymap.json` and writes it atomically (design 085 E2);
/// returns the file as [`load`] reads it now.
pub fn save(config_dir: &Path, changes: &KeymapChanges) -> Result<KeymapOverrides, FsError> {
    check(changes)?;
    let file = config_dir.join(FILE_NAME);
    let mut root = read_object(&file)?;
    root.entry("version").or_insert(Value::from(1));
    let bindings = root
        .entry("bindings")
        .or_insert_with(|| Value::Object(Map::new()));
    if !bindings.is_object() {
        *bindings = Value::Object(Map::new());
    }
    let map = bindings.as_object_mut().expect("an object above");
    for (id, chords) in changes {
        match chords {
            None => {
                map.shift_remove(id);
            }
            Some(c) => {
                map.insert(id.clone(), Value::from(c.clone()));
            }
        }
    }
    let mut text = serde_json::to_string_pretty(&Value::Object(root))
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?;
    text.push('\n');
    if text.len() as u64 > MAX_FILE {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            "keymap.json would be too large",
            Some(&file),
        ));
    }
    write_atomic(&file, text.as_bytes()).map_err(|e| FsError::from_io(&e, &file))?;
    Ok(load(config_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(entries: &[(&str, Option<&[&str]>)]) -> KeymapChanges {
        entries
            .iter()
            .map(|(id, c)| {
                (
                    (*id).to_owned(),
                    c.map(|c| c.iter().map(|s| (*s).to_owned()).collect()),
                )
            })
            .collect()
    }

    /// Written by hand: own fields, an action this version does not know, its own order.
    const HAND: &str = r#"{
  "comment": "my shortcuts",
  "bindings": {
    "view.zoomIn": ["Mod+Shift+="],
    "future.action": ["Mod+k"],
    "transform.rotate": ["q"]
  },
  "version": 1,
  "extra": { "keep": [1, 2] }
}
"#;

    #[test]
    fn saving_writes_only_the_patch_and_keeps_the_rest() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(FILE_NAME), HAND).unwrap();
        let o = save(
            d.path(),
            &patch(&[
                ("transform.rotate", None),
                ("app.palette", Some(&["Mod+k", "F1"])),
                ("tool.select", Some(&[])),
                ("edit.undo", None),
            ]),
        )
        .unwrap();
        // reset entries are gone, set ones are there, nothing else was touched
        assert_eq!(
            o.bindings.keys().collect::<Vec<_>>(),
            ["app.palette", "future.action", "tool.select", "view.zoomIn"]
        );
        assert_eq!(o.bindings["app.palette"], ["Mod+k", "F1"]);
        assert!(o.bindings["tool.select"].is_empty());
        let text = std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["comment"], "my shortcuts");
        assert_eq!(v["extra"]["keep"], serde_json::json!([1, 2]));
        assert_eq!(v["version"], 1);
        // the hand-written order stays (preserve_order)
        let keys: Vec<&String> = v.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["comment", "bindings", "version", "extra"]);
        let ids: Vec<&String> = v["bindings"].as_object().unwrap().keys().collect();
        assert_eq!(
            ids,
            ["view.zoomIn", "future.action", "app.palette", "tool.select"]
        );
        // no temp files left
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 1);
    }

    #[test]
    fn an_empty_patch_round_trips_a_hand_written_file() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(FILE_NAME), HAND).unwrap();
        let before = load(d.path());
        let o = save(d.path(), &KeymapChanges::new()).unwrap();
        assert_eq!(o, before);
        let a: Value = serde_json::from_str(HAND).unwrap();
        let text = std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap();
        let b: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(a, b);
        // and saving twice is stable byte for byte
        save(d.path(), &KeymapChanges::new()).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap(),
            text
        );
    }

    #[test]
    fn a_new_file_has_a_version_and_only_the_deviations() {
        let d = tempfile::tempdir().unwrap();
        let o = save(
            d.path().join("sub").as_path(),
            &patch(&[("transform.rotate", Some(&["q"])), ("edit.undo", None)]),
        )
        .unwrap();
        assert_eq!(o.bindings.len(), 1);
        let text = std::fs::read_to_string(d.path().join("sub").join(FILE_NAME)).unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "version": 1, "bindings": { "transform.rotate": ["q"] } })
        );
        // resetting the last entry leaves an empty map, not a missing file
        let o = save(
            d.path().join("sub").as_path(),
            &patch(&[("transform.rotate", None)]),
        )
        .unwrap();
        assert!(o.bindings.is_empty());
    }

    #[test]
    fn hostile_patches_are_refused_and_nothing_is_written() {
        let d = tempfile::tempdir().unwrap();
        let nine: Vec<&str> = vec!["a"; 9];
        for bad in [
            patch(&[("../x", Some(&["a"]))]),
            patch(&[("app.palette", Some(&nine))]),
            patch(&[("app.palette", Some(&["a\nb"]))]),
            patch(&[("app.palette", Some(&[""]))]),
        ] {
            let e = save(d.path(), &bad).unwrap_err();
            assert_eq!(e.code, FsErrorCode::InvalidKeymap);
        }
        let many: KeymapChanges = (0..=MAX_CHANGES)
            .map(|i| (format!("a.b{i}"), None))
            .collect();
        assert_eq!(
            save(d.path(), &many).unwrap_err().code,
            FsErrorCode::InvalidKeymap
        );
        assert!(!d.path().join(FILE_NAME).exists());
    }

    #[test]
    fn a_broken_file_is_kept_aside_and_replaced() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(FILE_NAME), b"[1, 2").unwrap();
        let o = save(d.path(), &patch(&[("app.palette", Some(&["F1"]))])).unwrap();
        assert_eq!(o.bindings["app.palette"], ["F1"]);
        assert!(d.path().join("keymap.json.bad").exists());
        // `bindings` of the wrong type is replaced, the rest stays
        std::fs::write(d.path().join(FILE_NAME), r#"{"bindings":[1],"note":"x"}"#).unwrap();
        save(d.path(), &patch(&[("app.palette", Some(&["F2"]))])).unwrap();
        let v: Value =
            serde_json::from_str(&std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap())
                .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "bindings": { "app.palette": ["F2"] }, "note": "x", "version": 1 })
        );
    }

    #[test]
    fn a_result_over_the_limit_is_too_large() {
        let d = tempfile::tempdir().unwrap();
        let big = format!(r#"{{"version":1,"note":"{}"}}"#, "x".repeat(65_000));
        std::fs::write(d.path().join(FILE_NAME), &big).unwrap();
        let long: Vec<&str> = vec!["Mod+Shift+Alt+ArrowDown"; 8];
        let changes: KeymapChanges = (0..20)
            .map(|i| {
                (
                    format!("a.b{i}"),
                    Some(long.iter().map(|s| (*s).to_owned()).collect()),
                )
            })
            .collect();
        assert_eq!(
            save(d.path(), &changes).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert_eq!(
            std::fs::read_to_string(d.path().join(FILE_NAME)).unwrap(),
            big
        );
    }

    #[test]
    fn an_unreadable_file_is_not_written_over() {
        let d = tempfile::tempdir().unwrap();
        // a folder in the place of the file cannot be read
        std::fs::create_dir(d.path().join(FILE_NAME)).unwrap();
        assert!(save(d.path(), &patch(&[("app.palette", Some(&["F1"]))])).is_err());
        assert!(d.path().join(FILE_NAME).is_dir());
    }

    #[test]
    fn missing_file_is_no_override() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load(d.path()), KeymapOverrides::default());
    }

    #[test]
    fn entries_are_checked() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(
            d.path().join(FILE_NAME),
            r#"{"version":1,"bindings":{"view.zoomIn":["j","Mod++","Shift+Cmd+p","","a\nb"],"../x":["a"],"app.palette":[]}}"#,
        )
        .unwrap();
        let o = load(d.path());
        assert_eq!(o.bindings.len(), 2);
        // the frontend normalises `Shift+Cmd+p`; only what is no chord text goes here
        assert_eq!(o.bindings["view.zoomIn"], ["j", "Mod++", "Shift+Cmd+p"]);
        assert!(o.bindings["app.palette"].is_empty());
        assert!(o.warning.is_none());
    }

    #[test]
    fn broken_file_gives_a_warning() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(FILE_NAME), b"{ nope").unwrap();
        let o = load(d.path());
        assert!(o.bindings.is_empty());
        assert_eq!(o.warning.unwrap().code, "broken");
    }
}
