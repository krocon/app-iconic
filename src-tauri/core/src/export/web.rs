//! Web / PWA icons (prompt 079, design E6–E8): a folder `web/` whose files go into the site's
//! root:
//!
//! - `favicon.ico` 16, 32, 48 px and `favicon.svg` (light and dark of the document, switched by
//!   `prefers-color-scheme` – web.dev, "Building an adaptive favicon"; built by the frontend and
//!   written as it is).
//! - `apple-touch-icon.png` 180 × 180 without transparency (Apple, "Configuring Web
//!   Applications": `<link rel="apple-touch-icon" sizes="180x180">`; iOS masks it itself).
//! - `icon-192.png`, `icon-512.png` (`purpose: any`) and `icon-maskable-512.png` (`purpose:
//!   maskable`: opaque, the content inside the safe zone – a centred circle with a radius of 40 %
//!   of the icon, web.dev "Adaptive icon support in PWAs with maskable icons").
//! - `manifest.webmanifest` (the `icons` member to merge) and `snippet.html` (the `<link>` tags);
//!   the dialog shows both to copy (TS `export-web.ts`, same reference files).

use super::package::{Content, PackagePlan, PlannedFile, source};

/// The folder (its files go into the web root).
pub const FOLDER: &str = "web";

/// Sizes of `favicon.ico`.
pub const FAVICON_SIZES: [u32; 3] = [16, 32, 48];
pub const TOUCH_SIZE: u32 = 180;

const WHITE: [u8; 3] = [255, 255, 255];

/// `manifest.webmanifest`: the icons (testdata/export/web/manifest.webmanifest).
pub const MANIFEST: &str = r#"{
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
"#;

/// `snippet.html`: the `<link>` tags for `<head>` (testdata/export/web/snippet.html).
pub const SNIPPET: &str = r#"<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
"#;

/// The plan of the web set (see the module comment).
pub fn plan() -> PackagePlan {
    let files = vec![
        PlannedFile {
            path: "favicon.ico".into(),
            content: Content::Ico {
                source: source::WEB_ANY.into(),
                sizes: FAVICON_SIZES.to_vec(),
            },
        },
        PlannedFile {
            path: "favicon.svg".into(),
            content: Content::Svg {
                source: source::WEB_FAVICON.into(),
            },
        },
        PlannedFile::png(
            "apple-touch-icon.png",
            source::WEB_TOUCH,
            TOUCH_SIZE,
            Some(WHITE),
        ),
        PlannedFile::png("icon-192.png", source::WEB_ANY, 192, None),
        PlannedFile::png("icon-512.png", source::WEB_ANY, 512, None),
        PlannedFile::png(
            "icon-maskable-512.png",
            source::WEB_MASKABLE,
            512,
            Some(WHITE),
        ),
        PlannedFile::text("manifest.webmanifest", MANIFEST),
        PlannedFile::text("snippet.html", SNIPPET),
    ];
    PackagePlan {
        folder: Some(FOLDER.into()),
        files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texts_match_the_reference_files() {
        assert_eq!(
            MANIFEST,
            include_str!("../../../../testdata/export/web/manifest.webmanifest")
        );
        assert_eq!(
            SNIPPET,
            include_str!("../../../../testdata/export/web/snippet.html")
        );
        // the manifest is valid JSON with the three icons
        let json: serde_json::Value = serde_json::from_str(MANIFEST).unwrap();
        let icons = json["icons"].as_array().unwrap();
        assert_eq!(icons.len(), 3);
        assert_eq!(icons[2]["purpose"], "maskable");
        // every file the texts name is planned
        let p = plan();
        for name in [
            "favicon.ico",
            "favicon.svg",
            "apple-touch-icon.png",
            "manifest.webmanifest",
        ] {
            assert!(SNIPPET.contains(&format!("/{name}")));
            assert!(p.files.iter().any(|f| f.path == name), "{name}");
        }
        for icon in icons {
            let src = icon["src"].as_str().unwrap().trim_start_matches('/');
            assert!(p.files.iter().any(|f| f.path == src), "{src}");
        }
    }

    #[test]
    fn files_and_sources() {
        let p = plan();
        assert_eq!(p.folder.as_deref(), Some(FOLDER));
        let names: Vec<&str> = p.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            names,
            [
                "favicon.ico",
                "favicon.svg",
                "apple-touch-icon.png",
                "icon-192.png",
                "icon-512.png",
                "icon-maskable-512.png",
                "manifest.webmanifest",
                "snippet.html"
            ]
        );
        assert_eq!(
            p.files[2].content,
            Content::Png {
                source: "web-touch".into(),
                size: 180,
                background: Some(WHITE)
            }
        );
        assert_eq!(
            p.files[0].content,
            Content::Ico {
                source: "web-any".into(),
                sizes: vec![16, 32, 48]
            }
        );
    }
}
