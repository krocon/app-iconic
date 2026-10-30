//! Nach editlicious `src-tauri/src/settings.rs` (Prompt 009, MIT, gleicher Autor), für AppIconic
//! umgebaut: Abschnitte, Laden je Feld, Schema-Version mit Migration, Patches.
//!
//! The workspace settings (design 015): `<app config>/settings.json`. Read leniently **field by
//! field** (E2): the file is laid over the defaults – a known key of the right kind counts, any
//! other value falls back to its default on its own; then [`sanitize`] clamps ranges and checks
//! enumerations. A broken file is kept as `.bad` (`config_file`). `schemaVersion` (E3) runs
//! through [`migrate`]. Windows send **patches** (E4): [`apply_patch`] lays one over the current
//! settings, so two windows never overwrite each other's change. Defaults from legacy §9; the
//! same table of cases is checked in TS (`testdata/settings-cases.json`).

use crate::config_file::{self, Loaded};
use crate::error::FsError;
use crate::fs_atomic::write_atomic;
use serde_json::{Map, Value};
use std::path::Path;

mod model;
pub use model::*;
use model::{APPEARANCES, MASKS, MAX_BYTES, MAX_PATH, PNG_SIZES};

/// `#RGB…` normalised to `#RRGGBB(AA)` upper case; `None` for anything else.
fn hex_color(v: &str) -> Option<String> {
    let h = v.strip_prefix('#')?;
    if !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let full: String = match h.len() {
        3 | 4 => h.chars().flat_map(|c| [c, c]).collect(),
        6 | 8 => h.to_owned(),
        _ => return None,
    };
    let full = full.to_ascii_uppercase();
    // opaque alpha is left out
    Some(format!(
        "#{}",
        full.strip_suffix("FF")
            .filter(|f| f.len() == 6)
            .unwrap_or(&full)
    ))
}

/// Valid colours only, normalised, the first of duplicates kept, at most `max`.
fn color_list(list: &[String], max: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for c in list.iter().filter_map(|v| hex_color(v)) {
        if !out.contains(&c) {
            out.push(c);
        }
        if out.len() == max {
            break;
        }
    }
    out
}

/// Same kind of JSON value; an integer field (its base value is a non-negative integer) takes
/// only non-negative integers.
fn same_kind(base: &Value, input: &Value) -> bool {
    match (base, input) {
        (Value::Bool(_), Value::Bool(_)) | (Value::String(_), Value::String(_)) => true,
        (Value::Number(b), Value::Number(i)) => !b.is_u64() || i.is_u64(),
        _ => false,
    }
}

/**
 * `input` laid over `base` (design 015 E2): objects key by key (only the keys of `base`),
 * leaves of the same kind replace, lists keep the elements of the kind of the base list's first
 * element, `null` in `base` (an optional text) takes a text or `null`. Everything else is `base`.
 */
pub fn merge(base: &Value, input: &Value) -> Value {
    merge_shaped(base, base, input)
}

/// [`merge`] with the kinds taken from `shape` (the defaults) – the values of `base` may differ
/// from it (an optional text that is set stays clearable in a patch).
fn merge_shaped(shape: &Value, base: &Value, input: &Value) -> Value {
    match (shape, input) {
        (Value::Object(sh), Value::Object(i)) => {
            let mut out = Map::new();
            for (k, sv) in sh {
                let bv = base.get(k).unwrap_or(sv);
                let v = match i.get(k) {
                    Some(iv) => merge_shaped(sv, bv, iv),
                    None => bv.clone(),
                };
                out.insert(k.clone(), v);
            }
            Value::Object(out)
        }
        (Value::Array(sh), Value::Array(i)) => match sh.first() {
            Some(first) => {
                Value::Array(i.iter().filter(|x| same_kind(first, x)).cloned().collect())
            }
            // an empty default list holds texts (the colours of prompt 074)
            None => Value::Array(i.iter().filter(|x| x.is_string()).cloned().collect()),
        },
        (Value::Null, Value::String(_) | Value::Null) => input.clone(),
        _ if same_kind(shape, input) => input.clone(),
        _ => base.clone(),
    }
}

/// The version a file was written with (missing → 1, the first version; legacy §9).
fn version_of(v: &Value) -> u64 {
    v.get("schemaVersion").and_then(Value::as_u64).unwrap_or(1)
}

/**
 * Brings a file of an older schema up to [`SCHEMA_VERSION`] (design 015 E3), one step per
 * version. Version 1 is the first – no step yet; a newer version (written by a later app) is read
 * leniently as it is and saved as the current one (legacy: "unknown version → defaults / raise").
 */
pub fn migrate(mut v: Value) -> Value {
    let from = version_of(&v);
    // future steps: `if from < 2 { v = v1_to_v2(v); }` …
    let _ = from;
    if let Value::Object(map) = &mut v {
        map.insert("schemaVersion".into(), Value::from(SCHEMA_VERSION));
    }
    v
}

fn one_of(value: &mut String, allowed: &[&str], default: &str) {
    if !allowed.contains(&value.as_str()) {
        *value = default.to_owned();
    }
}

fn clamp_f(v: f64, min: f64, max: f64, fallback: f64) -> f64 {
    if v.is_finite() {
        v.clamp(min, max)
    } else {
        fallback
    }
}

/// Clamps and checks every field; the result is always usable.
pub fn sanitize(mut s: Settings) -> Settings {
    let d = Settings::default();
    s.schema_version = SCHEMA_VERSION;
    one_of(&mut s.theme, &["system", "light", "dark"], &d.theme);
    one_of(&mut s.language, &["system", "en", "de"], &d.language);
    for p in [
        &mut s.panels.commands,
        &mut s.panels.hierarchy,
        &mut s.panels.properties,
    ] {
        p.width = p.width.clamp(PANEL_MIN, PANEL_MAX);
    }
    let c = &mut s.canvas;
    c.grid_size = c.grid_size.clamp(1, 256);
    one_of(
        &mut c.guide_template,
        &["apple", "material", "grid"],
        &d.canvas.guide_template,
    );
    c.guide_divisions = c.guide_divisions.clamp(2, 64);
    one_of(
        &mut c.grid_origin,
        &["worldZero", "svgCenter"],
        &d.canvas.grid_origin,
    );
    one_of(
        &mut c.selection_mode,
        &["point", "boxed", "none"],
        &d.canvas.selection_mode,
    );
    c.zoom = if !c.zoom.is_finite() || c.zoom <= 0.0 {
        0.0
    } else {
        c.zoom.clamp(0.25, 2.0)
    };
    one_of(
        &mut c.appearance,
        &["system", "light", "dark"],
        &d.canvas.appearance,
    );
    one_of(&mut c.mask, &MASKS, &d.canvas.mask);
    let e = &mut s.export;
    one_of(
        &mut e.format,
        &["png", "svg", "appiconset", "icns", "ico", "android", "web"],
        &d.export.format,
    );
    one_of(&mut e.mask, &MASKS, &d.export.mask);
    // allowed values in their order, without duplicates; empty → default
    e.appearances = APPEARANCES
        .iter()
        .filter(|a| e.appearances.iter().any(|x| x == *a))
        .map(|a| (*a).to_owned())
        .collect();
    if e.appearances.is_empty() {
        e.appearances = d.export.appearances.clone();
    }
    e.sizes = PNG_SIZES
        .iter()
        .copied()
        .filter(|n| e.sizes.contains(n))
        .collect();
    if e.sizes.is_empty() {
        e.sizes = d.export.sizes.clone();
    }
    // allowed platforms in their order, without duplicates; empty → default (prompt 078)
    e.platforms = ["ios", "macos", "watchos"]
        .iter()
        .filter(|p| e.platforms.iter().any(|x| x == *p))
        .map(|p| (*p).to_owned())
        .collect();
    if e.platforms.is_empty() {
        e.platforms = d.export.platforms.clone();
    }
    if e.target_dir
        .as_ref()
        .is_some_and(|p| p.is_empty() || p.len() > MAX_PATH || p.contains('\0'))
    {
        e.target_dir = None;
    }
    let f = &mut s.freehand;
    f.epsilon = clamp_f(f.epsilon, 0.0, 20.0, d.freehand.epsilon);
    f.stroke_width = f.stroke_width.clamp(1, 64);
    s.colors.recent = color_list(&s.colors.recent, MAX_RECENT_COLORS);
    s.colors.palette = color_list(&s.colors.palette, MAX_PALETTE_COLORS);
    let fallback = DrawStyle::thin_line();
    for style in s.drawing.styles.all_mut() {
        let mut d = fallback.clone();
        for (v, dv) in style.fields_mut().into_iter().zip(d.fields_mut()) {
            if !style_value_ok(v) {
                *v = std::mem::take(dv);
            }
        }
    }
    s
}

fn default_value() -> Value {
    serde_json::to_value(Settings::default()).unwrap_or(Value::Null)
}

/// Settings from any JSON value: migrate, lay over the defaults, sanitize.
pub fn from_value(v: &Value) -> Settings {
    let migrated = migrate(v.clone());
    let merged = merge(&default_value(), &migrated);
    // `merge` keeps the shape of the defaults, so this only fails on a bug – then the defaults
    serde_json::from_value(merged)
        .map(sanitize)
        .unwrap_or_default()
}

/// `patch` (a part of the settings) laid over `current` (design 015 E4).
pub fn apply_patch(current: &Settings, patch: &Value) -> Settings {
    let base = serde_json::to_value(current).unwrap_or_else(|_| default_value());
    serde_json::from_value(merge_shaped(&default_value(), &base, patch))
        .map(sanitize)
        .unwrap_or_else(|_| current.clone())
}

/// `settings.json` of `dir`; a file that is no JSON object is broken (kept as `.bad`).
pub fn load(dir: &Path) -> Loaded<Settings> {
    config_file::read_config(&dir.join(FILE_NAME), MAX_BYTES, Settings::default, |text| {
        let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if !v.is_object() {
            return Err("not an object".into());
        }
        Ok(from_value(&v))
    })
}

/// Writes the settings atomically (pretty, for people who edit them by hand).
pub fn save(dir: &Path, s: &Settings) -> Result<(), FsError> {
    let file = dir.join(FILE_NAME);
    let mut json = serde_json::to_vec_pretty(&sanitize(s.clone()))
        .map_err(|e| FsError::from_io(&std::io::Error::other(e), &file))?;
    json.push(b'\n');
    std::fs::create_dir_all(dir).map_err(|e| FsError::from_io(&e, dir))?;
    write_atomic(&file, &json).map_err(|e| FsError::from_io(&e, &file))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    const CASES: &str = include_str!("../../../testdata/settings-cases.json");

    fn cases() -> Value {
        serde_json::from_str(CASES).unwrap()
    }

    fn at<'a>(v: &'a Value, path: &str) -> &'a Value {
        path.split('.').fold(v, |v, k| &v[k])
    }

    /// JSON equality with numbers compared as numbers (`0.0` = `0`).
    fn same(a: &Value, b: &Value) -> bool {
        match (a, b) {
            (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
            (Value::Array(x), Value::Array(y)) => {
                x.len() == y.len() && x.iter().zip(y).all(|(a, b)| same(a, b))
            }
            (Value::Object(x), Value::Object(y)) => {
                x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w)))
            }
            _ => a == b,
        }
    }

    #[test]
    fn defaults_are_the_shared_table() {
        let d = serde_json::to_value(Settings::default()).unwrap();
        assert!(same(&d, &cases()["defaults"]), "{d:#}");
        assert_eq!(sanitize(Settings::default()), Settings::default());
    }

    #[test]
    fn every_case_of_the_shared_table() {
        let all = cases();
        for case in all["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let got = serde_json::to_value(from_value(&case["input"])).unwrap();
            for e in case["expect"].as_array().unwrap() {
                let path = e[0].as_str().unwrap();
                assert!(
                    same(at(&got, path), &e[1]),
                    "{name}: {path} = {}",
                    at(&got, path)
                );
            }
        }
    }

    #[test]
    fn migration_per_version() {
        // missing version: the first one
        let s = from_value(&serde_json::json!({ "canvas": { "rulers": false } }));
        assert_eq!((s.schema_version, s.canvas.rulers), (1, false));
        // version 1 as it is
        let s = from_value(&serde_json::json!({ "schemaVersion": 1, "theme": "dark" }));
        assert_eq!((s.schema_version, s.theme.as_str()), (1, "dark"));
        // newer: read leniently, written as the current one
        let s = from_value(&serde_json::json!({ "schemaVersion": 99, "language": "de" }));
        assert_eq!((s.schema_version, s.language.as_str()), (1, "de"));
        // not a number: like a missing one
        let s = from_value(&serde_json::json!({ "schemaVersion": "two", "theme": "light" }));
        assert_eq!((s.schema_version, s.theme.as_str()), (1, "light"));
        assert_eq!(migrate(serde_json::json!({}))["schemaVersion"], 1);
    }

    #[test]
    fn save_load_round_trip() {
        let dir = tempdir().unwrap();
        let cfg = dir.path().join("nested ü");
        assert_eq!(load(&cfg).value, Settings::default());
        let mut s = Settings::default();
        s.panels.hierarchy.width = 333;
        s.canvas.zoom = 1.25;
        s.export.target_dir = Some("/tmp/x".into());
        save(&cfg, &s).unwrap();
        let l = load(&cfg);
        assert_eq!((l.value, l.warning, l.persist), (s, None, true));
        let text = fs::read_to_string(cfg.join(FILE_NAME)).unwrap();
        assert!(text.contains("\"schemaVersion\": 1"), "{text}");
    }

    #[test]
    fn a_broken_file_is_kept_aside() {
        let dir = tempdir().unwrap();
        for text in ["{ nope", "[1, 2]", "\"text\""] {
            fs::write(dir.path().join(FILE_NAME), text).unwrap();
            let l = load(dir.path());
            assert_eq!(l.value, Settings::default(), "{text}");
            let w = l.warning.unwrap();
            assert_eq!(w.code, "broken");
            assert!(w.path.unwrap().ends_with("settings.json.bad"));
            assert!(l.persist);
            assert!(!dir.path().join(FILE_NAME).exists());
        }
    }

    #[test]
    fn an_unreadable_file_is_not_written_over() {
        let dir = tempdir().unwrap();
        // a folder in place of the file cannot be read
        fs::create_dir(dir.path().join(FILE_NAME)).unwrap();
        let l = load(dir.path());
        assert_eq!(l.warning.unwrap().code, "unreadable");
        assert!(!l.persist);
    }

    #[test]
    fn patches_change_only_what_they_name() {
        let mut current = Settings::default();
        current.canvas.rulers = false;
        let s = apply_patch(
            &current,
            &serde_json::json!({ "panels": { "commands": { "width": 1000 } }, "theme": "dark" }),
        );
        assert_eq!(s.panels.commands.width, PANEL_MAX);
        assert_eq!(s.theme, "dark");
        assert!(!s.canvas.rulers, "untouched field kept");
        // a bad value in a patch keeps the current one
        let s = apply_patch(
            &s,
            &serde_json::json!({ "theme": 1, "canvas": { "zoom": 1.5 } }),
        );
        assert_eq!((s.theme.as_str(), s.canvas.zoom), ("dark", 1.5));
        // clearing the export folder
        let mut with_dir = Settings::default();
        with_dir.export.target_dir = Some("/a".into());
        let s = apply_patch(
            &with_dir,
            &serde_json::json!({ "export": { "targetDir": null } }),
        );
        assert_eq!(s.export.target_dir, None);
    }

    #[test]
    fn reset_writes_the_defaults() {
        let dir = tempdir().unwrap();
        let s = Settings {
            language: "de".into(),
            ..Default::default()
        };
        save(dir.path(), &s).unwrap();
        save(dir.path(), &Settings::default()).unwrap();
        assert_eq!(load(dir.path()).value, Settings::default());
    }
}
