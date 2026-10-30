//! DTOs shared with the frontend (serde camelCase). Keep in sync with the `*.models.ts` files
//! under `src/app/core/` by hand; every change on both sides + a test.

use serde::Serialize;

/// Data for the About dialog (`src/app/core/about/about.models.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: String,
    pub arch: String,
}

// ---- prompt 002: `.icon` files (`src/app/core/icon-file/icon-file.models.ts`) ----

use ai_core::icon::{AssetKind, IconFile, IconFormat, IconWarning};
use ai_core::recent::display_name;
use serde::Deserialize;
use serde_json::Value;

/// One asset of an opened document. SVG comes as text, PNG as data URL, others by name only.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconAssetDto {
    pub name: String,
    pub kind: AssetKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

/// An opened (or new) `.icon` document.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconDocumentDto {
    /// `None` for a new, unsaved document.
    pub path: Option<String>,
    /// File name shown in the title (design 003 E13); `None` with `path`.
    pub name: Option<String>,
    pub format: IconFormat,
    /// `icon.json` as is – unknown fields included, key order kept.
    pub icon_json: Value,
    pub assets: Vec<IconAssetDto>,
    pub warnings: Vec<IconWarning>,
}

impl IconDocumentDto {
    pub fn from_file(path: Option<String>, file: &IconFile) -> Self {
        Self {
            name: path.as_deref().map(display_name),
            path,
            format: file.format,
            icon_json: file.json.clone(),
            assets: file
                .assets
                .iter()
                .map(|a| IconAssetDto {
                    name: a.name.clone(),
                    kind: a.kind,
                    text: a.text().map(str::to_owned),
                    data_url: a.data_url(),
                })
                .collect(),
            warnings: file.warnings.clone(),
        }
    }
}

/// One asset in `save_icon`: changed/new ones carry `text`, unchanged ones only the name.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAssetDto {
    pub name: String,
    #[serde(default)]
    pub text: Option<String>,
    /// A new or replaced PNG asset as `data:image/png;base64,…` (prompt 080 E6).
    #[serde(default)]
    pub data_url: Option<String>,
    #[serde(default)]
    pub unchanged: bool,
    /// With `unchanged`: the asset's name in the session before it was renamed (design 010 E9).
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    /// File name shown in the title (design 003 E13).
    pub name: String,
    pub format: IconFormat,
}

// ---- prompt 003: recent files (`src/app/core/recent/recent.models.ts`) ----

/// One entry of "Open Recent".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileDto {
    pub path: String,
    pub name: String,
}

/// One entry of the start screen (prompt 082): name, folder and preview image as data URL – the
/// WebView never sees a path of the preview cache.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntryDto {
    pub path: String,
    pub name: String,
    /// The folder the file lies in (shown beside the name).
    pub location: String,
    /// `data:image/png;base64,…`; `None` = no preview yet.
    pub thumbnail: Option<String>,
}

impl RecentFileDto {
    pub fn list(paths: &[String]) -> Vec<Self> {
        paths
            .iter()
            .map(|p| Self {
                path: p.clone(),
                name: display_name(p),
            })
            .collect()
    }
}

// ---- prompt 084: the own symbol library (`src/app/core/symbols/symbol-library.models.ts`) ----

/// A symbol of the own library: id (a file stem, never a path), name, tags and the cleaned SVG.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySymbolDto {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub svg: String,
}

impl From<ai_core::symbols::LibrarySymbol> for LibrarySymbolDto {
    fn from(s: ai_core::symbols::LibrarySymbol) -> Self {
        Self {
            id: s.id,
            name: s.name,
            tags: s.tags,
            svg: s.svg,
        }
    }
}

/// `list_symbols`: the library and the recently used symbols of every set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolLibraryDto {
    pub symbols: Vec<LibrarySymbolDto>,
    pub recent: Vec<ai_core::symbols::recent::SymbolRef>,
}

/// `import_symbols`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolImportDto {
    pub imported: usize,
    pub skipped: usize,
    pub full: bool,
}

/// `export_symbols`: the new folder (a path the user chose a parent of) and the count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolExportDto {
    pub folder: String,
    pub count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_core::icon::{IconAsset, new_icon};
    use serde_json::json;

    #[test]
    fn document_dto_is_camel_case_and_skips_missing_content() {
        let mut file = new_icon();
        file.assets.push(IconAsset::new("p.png", vec![1, 2, 3]));
        file.assets.push(IconAsset::new("x.bin", vec![1]));
        let v = serde_json::to_value(IconDocumentDto::from_file(None, &file)).unwrap();
        assert_eq!(v["path"], Value::Null);
        assert_eq!(v["name"], Value::Null);
        assert_eq!(v["format"], "bundle");
        assert_eq!(v["iconJson"]["fill"], "automatic");
        assert_eq!(v["assets"][0]["kind"], "svg");
        assert!(v["assets"][0]["text"].as_str().unwrap().starts_with("<svg"));
        assert_eq!(v["assets"][1]["dataUrl"], "data:image/png;base64,AQID");
        assert_eq!(v["assets"][2], json!({ "name": "x.bin", "kind": "other" }));
        assert_eq!(v["warnings"], json!([]));
    }

    #[test]
    fn save_asset_defaults() {
        let a: SaveAssetDto = serde_json::from_value(json!({ "name": "a.svg" })).unwrap();
        assert_eq!((a.text, a.unchanged, a.source), (None, false, None));
        assert_eq!(a.data_url, None);
        let a: SaveAssetDto = serde_json::from_value(
            json!({ "name": "a.png", "dataUrl": "data:image/png;base64,AA==" }),
        )
        .unwrap();
        assert_eq!(a.data_url.as_deref(), Some("data:image/png;base64,AA=="));
        let a: SaveAssetDto = serde_json::from_value(
            json!({ "name": "b.svg", "unchanged": true, "source": "a.svg" }),
        )
        .unwrap();
        assert_eq!((a.unchanged, a.source.as_deref()), (true, Some("a.svg")));
        let r = serde_json::to_value(SaveResult {
            path: "/a.icon".into(),
            name: "a.icon".into(),
            format: IconFormat::Zip,
        })
        .unwrap();
        assert_eq!(
            r,
            json!({ "path": "/a.icon", "name": "a.icon", "format": "zip" })
        );
    }

    #[test]
    fn opened_documents_and_recent_files_carry_the_file_name() {
        let path = std::env::temp_dir().join("Mein Icon.icon");
        let path = path.to_string_lossy().into_owned();
        let v = serde_json::to_value(IconDocumentDto::from_file(Some(path.clone()), &new_icon()))
            .unwrap();
        assert_eq!(v["name"], "Mein Icon.icon");
        let r = serde_json::to_value(RecentFileDto::list(std::slice::from_ref(&path))).unwrap();
        assert_eq!(r, json!([{ "path": path, "name": "Mein Icon.icon" }]));
    }

    #[test]
    fn start_screen_entries_are_camel_case_with_null_preview() {
        let e = RecentEntryDto {
            path: "/a/b.icon".into(),
            name: "b.icon".into(),
            location: "/a".into(),
            thumbnail: None,
        };
        assert_eq!(
            serde_json::to_value(e).unwrap(),
            json!({ "path": "/a/b.icon", "name": "b.icon", "location": "/a", "thumbnail": null })
        );
    }
    #[test]
    fn symbol_dtos_are_camel_case() {
        let lib = SymbolLibraryDto {
            symbols: vec![LibrarySymbolDto {
                id: "star".into(),
                name: "Star".into(),
                tags: vec!["shape".into()],
                svg: "<svg/>".into(),
            }],
            recent: vec![ai_core::symbols::recent::SymbolRef {
                set: "tabler".into(),
                id: "heart".into(),
            }],
        };
        assert_eq!(
            serde_json::to_value(&lib).unwrap(),
            json!({
                "symbols": [{ "id": "star", "name": "Star", "tags": ["shape"], "svg": "<svg/>" }],
                "recent": [{ "set": "tabler", "id": "heart" }]
            })
        );
        assert_eq!(
            serde_json::to_value(SymbolImportDto {
                imported: 2,
                skipped: 1,
                full: false
            })
            .unwrap(),
            json!({ "imported": 2, "skipped": 1, "full": false })
        );
        assert_eq!(
            serde_json::to_value(SymbolExportDto {
                folder: "/a/AppIconic Symbols".into(),
                count: 3
            })
            .unwrap(),
            json!({ "folder": "/a/AppIconic Symbols", "count": 3 })
        );
    }
}

// ---- prompt 083: recovery snapshots (`src/app/core/recovery/recovery.models.ts`) ----

/// A snapshot of an unsaved document left by an instance that is gone. The WebView gets its id –
/// never a path inside the recovery folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntryDto {
    pub id: String,
    /// The document's file; `None` for one never saved.
    pub path: Option<String>,
    /// File name for the list; `None` = untitled.
    pub name: Option<String>,
    /// The folder of `path`.
    pub location: Option<String>,
    /// When the snapshot was written (ms since 1970, UTC).
    pub saved_at: u64,
}

/// A restored snapshot: the document (with its original path) and the id the snapshot has now –
/// it belongs to this instance until the document is saved or discarded.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredDto {
    pub id: String,
    pub document: IconDocumentDto,
}
