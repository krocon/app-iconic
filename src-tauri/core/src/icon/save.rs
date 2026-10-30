//! Puts the document to save together (design 002 E3, E5): `icon.json` from the frontend,
//! changed assets as text (SVG) or as a PNG data URL (prompt 080 E6), unchanged assets and all
//! extra files from the session (the version last opened or saved). The asset list is complete –
//! an asset left out is deleted.

use super::names::{is_valid_asset_name, name_key};
use super::{AssetKind, IconAsset, IconFile, IconFormat, IconJson, Limits, format_icon_json};
use crate::error::{FsError, FsErrorCode};
use serde_json::Value;
use std::path::Path;

/// One asset as the frontend sends it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetInput {
    pub name: String,
    /// New content (SVG text) when the asset was changed or added.
    pub text: Option<String>,
    /// New content of a PNG asset as `data:image/png;base64,…` (prompt 080 E6).
    pub data_url: Option<String>,
    /// Take the bytes from the session; `text` is ignored.
    pub unchanged: bool,
    /// With `unchanged`: the name of the asset in the session when it was renamed (design 010 E9).
    pub source: Option<String>,
}

/// The bytes of a `data:image/png;base64,…` URL (prompt 080 E6): standard Base64, the PNG
/// signature at the start, at most [`Limits::max_file`] bytes – the size a `.icon` may hold per file.
pub fn decode_png_data_url(url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let b64 = url.strip_prefix("data:image/png;base64,")?;
    if b64.len() as u64 / 4 * 3 > Limits::default().max_file {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    bytes.starts_with(PNG_SIGNATURE).then_some(bytes)
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// The file to write. `base` is the session of the document (`None` for a new one).
pub fn assemble(
    base: Option<&IconFile>,
    format: IconFormat,
    json: Value,
    inputs: Vec<AssetInput>,
    path: &Path,
) -> Result<IconFile, FsError> {
    IconJson::from_value(&json).map_err(|e| {
        FsError::new(
            FsErrorCode::InvalidIcon,
            format!("icon.json: {e}"),
            Some(path),
        )
    })?;
    let mut seen = std::collections::HashSet::new();
    let mut assets = Vec::with_capacity(inputs.len());
    for input in inputs {
        if !is_valid_asset_name(&input.name) || !seen.insert(name_key(&input.name)) {
            return Err(FsError::new(
                FsErrorCode::InvalidPath,
                format!("invalid or duplicate asset name {:?}", input.name),
                Some(path),
            ));
        }
        let bytes = if input.unchanged {
            let from = input.source.as_deref().unwrap_or(&input.name);
            base.and_then(|b| b.asset(from))
                .map(|a| a.bytes.clone())
                .ok_or_else(|| {
                    FsError::new(
                        FsErrorCode::MissingAsset,
                        format!("unknown asset {from:?}"),
                        Some(path),
                    )
                })?
        } else if let Some(text) = input.text {
            text.into_bytes()
        } else {
            let bytes = input
                .data_url
                .as_deref()
                .filter(|_| AssetKind::of(&input.name) == AssetKind::Png)
                .and_then(decode_png_data_url);
            bytes.ok_or_else(|| {
                FsError::new(
                    FsErrorCode::InvalidIcon,
                    format!("no content for asset {:?}", input.name),
                    Some(path),
                )
            })?
        };
        assets.push(IconAsset::new(input.name, bytes));
    }
    let json_bytes = match base {
        Some(b) if b.json == json => b.json_bytes.clone(),
        _ => format_icon_json(&json),
    };
    Ok(IconFile {
        format,
        json_bytes,
        json,
        assets,
        extra_files: base.map(|b| b.extra_files.clone()).unwrap_or_default(),
        zip_root: base
            .filter(|b| b.format == IconFormat::Zip)
            .map(|b| b.zip_root.clone())
            .unwrap_or_default(),
        outside_root: base
            .filter(|b| b.format == IconFormat::Zip && format == IconFormat::Zip)
            .map(|b| b.outside_root.clone())
            .unwrap_or_default(),
        warnings: Vec::new(),
    })
}

#[cfg(test)]
#[path = "save_png_tests.rs"]
mod png_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::testdata::{camscanner, copy_tree, tree};
    use crate::icon::{Limits, read_icon, write_icon};
    use serde_json::json;
    use tempfile::tempdir;

    fn unchanged(f: &IconFile) -> Vec<AssetInput> {
        f.assets
            .iter()
            .map(|a| AssetInput {
                name: a.name.clone(),
                text: None,
                data_url: None,
                unchanged: true,
                source: None,
            })
            .collect()
    }

    /// Prompt 002, acceptance: open + save unchanged = identical files.
    #[test]
    fn unchanged_document_is_written_byte_for_byte() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("cam.icon");
        copy_tree(&camscanner(), &target);
        let base = read_icon(&target, &Limits::default()).unwrap();
        // the JSON goes through the frontend: parsed again from a compact string
        let from_frontend: Value =
            serde_json::from_str(&serde_json::to_string(&base.json).unwrap()).unwrap();
        let f = assemble(
            Some(&base),
            base.format,
            from_frontend,
            unchanged(&base),
            &target,
        )
        .unwrap();
        write_icon(&target, &f).unwrap();
        assert_eq!(tree(&target), tree(&camscanner()));
    }

    /// Prompt 002, acceptance: with a changed asset only that asset changes.
    #[test]
    fn a_changed_asset_changes_only_that_file() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("cam.icon");
        copy_tree(&camscanner(), &target);
        let base = read_icon(&target, &Limits::default()).unwrap();
        let mut inputs = unchanged(&base);
        inputs[1].unchanged = false;
        inputs[1].text = Some("<svg>new</svg>".into());
        let f = assemble(Some(&base), base.format, base.json.clone(), inputs, &target).unwrap();
        write_icon(&target, &f).unwrap();
        let (before, after) = (tree(&camscanner()), tree(&target));
        let changed: Vec<_> = after.keys().filter(|k| after[*k] != before[*k]).collect();
        assert_eq!(changed, ["Assets/logo-scanner-2 2.svg"]);
    }

    #[test]
    fn a_changed_json_is_formatted_like_icon_composer_and_keeps_unknown_fields() {
        let base = read_icon(&camscanner(), &Limits::default()).unwrap();
        let mut json = base.json.clone();
        json["groups"][1]["layers"][0]["opacity"] = json!(0.25);
        json["x-future"] = json!({ "a": [1, 2] });
        let f = assemble(
            Some(&base),
            base.format,
            json,
            unchanged(&base),
            Path::new("/x"),
        )
        .unwrap();
        let text = String::from_utf8(f.json_bytes).unwrap();
        assert!(text.contains("\"name\" : \"logo-scanner-2 2\",\n          \"opacity\" : 0.25"));
        assert!(
            text.ends_with("\"x-future\" : {\n    \"a\" : [\n      1,\n      2\n    ]\n  }\n}")
        );
        assert!(
            text.contains("\"opacity\" : 1\n"),
            "layer opacity of group 1 kept"
        );
    }

    /// Design 010 E9: a renamed, otherwise unchanged asset comes from the session under its old name.
    #[test]
    fn a_renamed_asset_takes_its_bytes_from_the_old_name() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("cam.icon");
        copy_tree(&camscanner(), &target);
        let base = read_icon(&target, &Limits::default()).unwrap();
        let mut inputs = unchanged(&base);
        inputs[0].source = Some(inputs[0].name.clone());
        inputs[0].name = "renamed.svg".into();
        let mut json = base.json.clone();
        json["groups"][0]["layers"][0]["image-name"] = json!("renamed.svg");
        let f = assemble(Some(&base), base.format, json, inputs, &target).unwrap();
        write_icon(&target, &f).unwrap();
        let (before, after) = (tree(&camscanner()), tree(&target));
        assert_eq!(
            after["Assets/renamed.svg"],
            before["Assets/logo-scanner 3.svg"]
        );
        assert!(!after.contains_key("Assets/logo-scanner 3.svg"));
        assert_eq!(
            after["Assets/logo-scanner-2 2.svg"],
            before["Assets/logo-scanner-2 2.svg"]
        );
        // a source the session does not know is an error, nothing is guessed
        let mut bad = unchanged(&base);
        bad[0].source = Some("nope.svg".into());
        let e = assemble(Some(&base), base.format, base.json.clone(), bad, &target).unwrap_err();
        assert_eq!(e.code, FsErrorCode::MissingAsset);
    }

    /// Prompt 010, Rust: every documented field + unknown ones survive an edit elsewhere.
    #[test]
    fn the_all_fields_fixture_survives_an_edit_elsewhere() {
        let fixture = crate::icon::testdata::all_fields();
        let dir = tempdir().unwrap();
        let target = dir.path().join("all.icon");
        copy_tree(&fixture, &target);
        let base = read_icon(&target, &Limits::default()).unwrap();
        assert!(base.warnings.is_empty(), "{:?}", base.warnings);
        // unchanged = byte for byte
        let f = assemble(
            Some(&base),
            base.format,
            base.json.clone(),
            unchanged(&base),
            &target,
        )
        .unwrap();
        write_icon(&target, &f).unwrap();
        assert_eq!(tree(&target), tree(&fixture));
        // one field changed (as the inspector does): only that line differs
        let mut json = base.json.clone();
        json["groups"][0]["shadow"]["opacity"] = json!(0.25);
        let f = assemble(
            Some(&base),
            base.format,
            json.clone(),
            unchanged(&base),
            &target,
        )
        .unwrap();
        write_icon(&target, &f).unwrap();
        let reread = read_icon(&target, &Limits::default()).unwrap();
        assert_eq!(reread.json, json);
        let old = String::from_utf8(tree(&fixture)["icon.json"].clone()).unwrap();
        let new = String::from_utf8(tree(&target)["icon.json"].clone()).unwrap();
        let diff: Vec<_> = old
            .lines()
            .zip(new.lines())
            .filter(|(a, b)| a != b)
            .collect();
        assert_eq!(old.lines().count(), new.lines().count());
        assert_eq!(diff.len(), 1, "{diff:?}");
        assert!(diff[0].1.trim() == "\"opacity\" : 0.25,");
        for key in [
            "x-future-root",
            "x-future-group",
            "x-future-layer",
            "x-future-shadow",
        ] {
            assert!(new.contains(key), "{key} kept");
        }
    }

    #[test]
    fn errors() {
        let base = read_icon(&camscanner(), &Limits::default()).unwrap();
        let p = Path::new("/x");
        let input = |name: &str, unchanged: bool| AssetInput {
            name: name.into(),
            text: None,
            data_url: None,
            unchanged,
            source: None,
        };
        let e = assemble(
            Some(&base),
            base.format,
            base.json.clone(),
            vec![input("nope.svg", true)],
            p,
        );
        assert_eq!(e.unwrap_err().code, FsErrorCode::MissingAsset);
        let e = assemble(
            None,
            base.format,
            base.json.clone(),
            vec![input("a.svg", true)],
            p,
        );
        assert_eq!(e.unwrap_err().code, FsErrorCode::MissingAsset);
        let e = assemble(
            None,
            base.format,
            base.json.clone(),
            vec![input("a.svg", false)],
            p,
        );
        assert_eq!(e.unwrap_err().code, FsErrorCode::InvalidIcon);
        let dup = vec![
            input("logo-scanner 3.svg", true),
            input("LOGO-scanner 3.svg", true),
        ];
        let e = assemble(Some(&base), base.format, base.json.clone(), dup, p);
        assert_eq!(e.unwrap_err().code, FsErrorCode::InvalidPath);
        let e = assemble(None, base.format, json!({ "groups": 1 }), vec![], p);
        assert_eq!(e.unwrap_err().code, FsErrorCode::InvalidIcon);
    }

    #[test]
    fn new_document_saved_as_zip() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("new.icon");
        let n = crate::icon::new_icon();
        let inputs = vec![AssetInput {
            name: "layer.svg".into(),
            text: Some(crate::icon::EMPTY_SVG.into()),
            data_url: None,
            unchanged: false,
            source: None,
        }];
        let f = assemble(None, IconFormat::Zip, n.json.clone(), inputs, &target).unwrap();
        assert_eq!(f.json_bytes, n.json_bytes);
        write_icon(&target, &f).unwrap();
        let back = read_icon(&target, &Limits::default()).unwrap();
        assert_eq!(back.format, IconFormat::Zip);
        assert_eq!(back.json, n.json);
        assert!(back.warnings.is_empty());
    }
}
