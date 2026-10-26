//! Apple Icon Composer files (`.icon`) – read and written **losslessly** (prompt 002, design in
//! `prompts/done/002-icon-dateiformat.design.md`).
//!
//! - [`model`]        typed view over `icon.json` (unknown fields on every level)
//! - [`json_format`]  `icon.json` output like Icon Composer
//! - [`names`]        unique asset/layer names, NFC comparison
//! - [`bundle`]       folder bundle: read, write with swap (002 E6)
//! - [`zip_io`]       zipped `.icon`: read with limits, write atomically
//! - [`save`]         put a document to save together from the frontend's data and the session
//! - [`svg_file`]     `read_svg_file` for "Import SVG…"
//!
//! An [`IconFile`] is the in-memory form: the original `icon.json` bytes and the parsed `Value`
//! (the truth, 002 E1), asset bytes, and every other file of the bundle/ZIP ("extra files").

pub mod bundle;
pub mod json_format;
pub mod model;
pub mod names;
pub mod save;
pub mod svg_file;
pub mod zip_io;

#[cfg(test)]
pub(crate) mod testdata;

use crate::error::{FsError, FsErrorCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;

pub use json_format::{format_icon_json, sort_keys};
pub use model::IconJson;
pub use names::{unique_asset_name, unique_layer_name};

/// On-disk form of a `.icon`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IconFormat {
    /// A folder with `icon.json` and `Assets/` (what Icon Composer writes).
    Bundle,
    /// The same zipped (what the legacy app wrote).
    Zip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Svg,
    Png,
    Other,
}

impl AssetKind {
    /// By file extension, ignoring case (002 E9).
    pub fn of(name: &str) -> Self {
        match name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
            Some(e) if e == "svg" => Self::Svg,
            Some(e) if e == "png" => Self::Png,
            _ => Self::Other,
        }
    }
}

/// A file directly under `Assets/`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IconAsset {
    pub name: String,
    pub bytes: Vec<u8>,
    pub kind: AssetKind,
}

impl IconAsset {
    pub fn new(name: impl Into<String>, bytes: Vec<u8>) -> Self {
        let name = name.into();
        let kind = AssetKind::of(&name);
        Self { name, bytes, kind }
    }

    /// SVG content as text (BOM removed); `None` for other kinds or non-UTF-8 bytes.
    pub fn text(&self) -> Option<&str> {
        (self.kind == AssetKind::Svg)
            .then(|| std::str::from_utf8(strip_bom(&self.bytes)).ok())
            .flatten()
    }

    /// PNG content as `data:image/png;base64,…`; `None` for other kinds.
    pub fn data_url(&self) -> Option<String> {
        use base64::Engine;
        (self.kind == AssetKind::Png).then(|| {
            format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&self.bytes)
            )
        })
    }
}

/// Any other file of the bundle/ZIP, kept and written back unchanged (002 E9).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtraFile {
    /// Relative, `/`-separated, checked to stay inside the bundle.
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IconWarningCode {
    /// An `image-name` without a file under `Assets/` (002 E11).
    MissingAsset,
    /// A symlink in the bundle – not followed, not kept (002 E8).
    IgnoredEntry,
    /// An SVG asset that is not UTF-8 – kept as bytes, no text (002 E9).
    UnreadableAsset,
}

/// Something worth telling the user that did not stop the file from opening.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IconWarning {
    pub code: IconWarningCode,
    pub name: String,
}

/// A `.icon` document in memory.
#[derive(Debug, Clone, PartialEq)]
pub struct IconFile {
    pub format: IconFormat,
    /// `icon.json` as read – written back unchanged when `json` did not change (002 E3).
    pub json_bytes: Vec<u8>,
    pub json: Value,
    pub assets: Vec<IconAsset>,
    pub extra_files: Vec<ExtraFile>,
    /// ZIP only: the folder inside the archive that holds `icon.json` (`""` or `X.icon/`, 002 E10).
    pub zip_root: String,
    /// ZIP only: entries outside `zip_root` (e.g. `__MACOSX/…`), full archive paths.
    pub outside_root: Vec<ExtraFile>,
    pub warnings: Vec<IconWarning>,
}

/// Limits for reading foreign files (002 E7).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub max_entries: usize,
    pub max_file: u64,
    pub max_total: u64,
    pub max_depth: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_entries: 2_000,
            max_file: 64 * 1024 * 1024,
            max_total: 256 * 1024 * 1024,
            max_depth: 16,
        }
    }
}

pub(crate) fn invalid(message: impl Into<String>, path: &Path) -> FsError {
    FsError::new(FsErrorCode::InvalidIcon, message, Some(path))
}

pub(crate) fn too_large(message: impl Into<String>, path: &Path) -> FsError {
    FsError::new(FsErrorCode::TooLarge, message, Some(path))
}

impl IconFile {
    /// Parses and checks `icon.json`, collects warnings for missing assets.
    pub(crate) fn from_parts(
        format: IconFormat,
        json_bytes: Vec<u8>,
        assets: Vec<IconAsset>,
        extra_files: Vec<ExtraFile>,
        mut warnings: Vec<IconWarning>,
        path: &Path,
    ) -> Result<Self, FsError> {
        let text = json_bytes
            .strip_prefix(b"\xEF\xBB\xBF".as_slice())
            .unwrap_or(&json_bytes);
        let json: Value =
            serde_json::from_slice(text).map_err(|e| invalid(format!("icon.json: {e}"), path))?;
        let view =
            IconJson::from_value(&json).map_err(|e| invalid(format!("icon.json: {e}"), path))?;
        for name in view.image_names() {
            if !assets.iter().any(|a| names::same_name(&a.name, name))
                && !warnings.iter().any(|w| w.name == name)
            {
                warnings.push(IconWarning {
                    code: IconWarningCode::MissingAsset,
                    name: name.to_owned(),
                });
            }
        }
        for a in &assets {
            if a.kind == AssetKind::Svg && std::str::from_utf8(strip_bom(&a.bytes)).is_err() {
                warnings.push(IconWarning {
                    code: IconWarningCode::UnreadableAsset,
                    name: a.name.clone(),
                });
            }
        }
        Ok(Self {
            format,
            json_bytes,
            json,
            assets,
            extra_files,
            zip_root: String::new(),
            outside_root: Vec::new(),
            warnings,
        })
    }

    pub fn asset(&self, name: &str) -> Option<&IconAsset> {
        self.assets.iter().find(|a| a.name == name)
    }
}

pub(crate) fn strip_bom(bytes: &[u8]) -> &[u8] {
    bytes
        .strip_prefix(b"\xEF\xBB\xBF".as_slice())
        .unwrap_or(bytes)
}

/// Opens a `.icon`: a folder is a bundle, a file a ZIP.
pub fn read_icon(path: &Path, limits: &Limits) -> Result<IconFile, FsError> {
    let meta = std::fs::metadata(path).map_err(|e| FsError::from_io(&e, path))?;
    if meta.is_dir() {
        bundle::read_bundle(path, limits)
    } else {
        zip_io::read_zip(path, limits)
    }
}

/// Writes `file` to `path` in `file.format` (bundle → folder, ZIP → file), atomically (002 E6).
pub fn write_icon(path: &Path, file: &IconFile) -> Result<(), FsError> {
    match file.format {
        IconFormat::Bundle => bundle::write_bundle(path, file),
        IconFormat::Zip => zip_io::write_zip(path, file),
    }
}

/// An empty 1024 × 1024 SVG for new layers.
pub const EMPTY_SVG: &str = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\">\n</svg>\n";

/// A new document (002 E13): one group, one layer, an empty SVG; platforms as Icon Composer.
pub fn new_icon() -> IconFile {
    let json = sort_keys(&json!({
        "fill": "automatic",
        "groups": [{
            "layers": [{ "image-name": "layer.svg", "name": "layer" }],
            "shadow": { "kind": "neutral", "opacity": 0.5 },
            "translucency": { "enabled": true, "value": 0.5 }
        }],
        "supported-platforms": { "circles": ["watchOS"], "squares": "shared" }
    }));
    IconFile {
        format: IconFormat::Bundle,
        json_bytes: format_icon_json(&json),
        json,
        assets: vec![IconAsset::new("layer.svg", EMPTY_SVG.as_bytes().to_vec())],
        extra_files: Vec::new(),
        zip_root: String::new(),
        outside_root: Vec::new(),
        warnings: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_by_extension() {
        assert_eq!(AssetKind::of("a.SVG"), AssetKind::Svg);
        assert_eq!(AssetKind::of("a b.png"), AssetKind::Png);
        assert_eq!(AssetKind::of("a.jpeg"), AssetKind::Other);
        assert_eq!(AssetKind::of("svg"), AssetKind::Other);
    }

    #[test]
    fn asset_text_and_data_url() {
        let svg = IconAsset::new("a.svg", b"\xEF\xBB\xBF<svg/>".to_vec());
        assert_eq!(svg.text(), Some("<svg/>"));
        assert_eq!(svg.data_url(), None);
        assert_eq!(IconAsset::new("a.svg", vec![0xff]).text(), None);
        let png = IconAsset::new("a.png", vec![0x89, b'P', b'N', b'G']);
        assert_eq!(png.data_url().unwrap(), "data:image/png;base64,iVBORw==");
        assert_eq!(png.text(), None);
    }

    #[test]
    fn new_icon_looks_like_icon_composer() {
        let icon = new_icon();
        let view = IconJson::from_value(&icon.json).unwrap();
        assert_eq!(view.groups.len(), 1);
        assert_eq!(view.image_names().collect::<Vec<_>>(), ["layer.svg"]);
        assert!(icon.asset("layer.svg").is_some());
        let text = String::from_utf8(icon.json_bytes.clone()).unwrap();
        assert!(
            text.contains(
                "\"circles\" : [\n      \"watchOS\"\n    ],\n    \"squares\" : \"shared\""
            )
        );
        assert!(text.find("\"fill\"") < text.find("\"groups\""));
    }

    #[test]
    fn broken_json_is_invalid_icon() {
        let p = Path::new("/x.icon");
        for bad in [&b"{"[..], b"[]", b"{\"groups\": 3}", b""] {
            let err =
                IconFile::from_parts(IconFormat::Bundle, bad.to_vec(), vec![], vec![], vec![], p)
                    .unwrap_err();
            assert_eq!(err.code, FsErrorCode::InvalidIcon);
        }
    }

    #[test]
    fn missing_assets_are_warnings_and_nfd_names_match() {
        let json =
            r#"{"groups":[{"layers":[{"image-name":"Größe.svg"},{"image-name":"gone.svg"}]}]}"#
                .as_bytes();
        let assets = vec![IconAsset::new("Gro\u{308}ße.svg", b"<svg/>".to_vec())];
        let f = IconFile::from_parts(
            IconFormat::Bundle,
            json.to_vec(),
            assets,
            vec![],
            vec![],
            Path::new("/x.icon"),
        )
        .unwrap();
        assert_eq!(
            f.warnings,
            [IconWarning {
                code: IconWarningCode::MissingAsset,
                name: "gone.svg".into()
            }]
        );
    }
}
