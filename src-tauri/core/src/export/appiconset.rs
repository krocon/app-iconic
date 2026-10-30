//! Xcode `AppIcon.appiconset` (prompt 078 E2–E5): a folder with `Contents.json` and PNGs.
//!
//! - **iOS/iPadOS** as "Single Size": one 1024 × 1024 image `idiom: universal, platform: ios`;
//!   dark and tinted as further entries with `appearances: [{ appearance: luminosity, value:
//!   dark|tinted }]` (the format Xcode 16+ writes for the Any/Dark/Tinted wells – Apple,
//!   "Configuring your app icon using an asset catalog"). The default image is the App Store
//!   icon: flattened onto white, RGB without alpha channel (E3). Dark and tinted keep their
//!   transparency ("Provide your dark app icon with a transparent background"); tinted is
//!   rendered grey ("Provide your tinted app icon as a grayscale image").
//! - **macOS**: every size, 16–512 pt @1x/@2x (`idiom: mac`), from the source with Apple's
//!   squircle mask, margin and shadow (E4).
//! - **watchOS** (optional): one 1024 image `platform: watchos`, flattened onto black (E5).

use super::package::{PackagePlan, PlannedFile, invalid, source};
use crate::error::FsError;
use serde::Serialize;
use serde_json::{Value, json};
use std::io;

/// The folder name – Xcode's default icon set name, so the folder can replace the template's.
pub const FOLDER: &str = "AppIcon.appiconset";

/// macOS sizes in points; each @1x and @2x.
pub const MAC_POINTS: [u32; 5] = [16, 32, 128, 256, 512];

const WHITE: [u8; 3] = [255, 255, 255];
const BLACK: [u8; 3] = [0, 0, 0];

/// Writes JSON the way Xcode does: two spaces, `"key" : value`.
struct XcodeFormatter(serde_json::ser::PrettyFormatter<'static>);

impl serde_json::ser::Formatter for XcodeFormatter {
    fn begin_array<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.begin_array(w)
    }
    fn end_array<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_array(w)
    }
    fn begin_array_value<W: ?Sized + io::Write>(
        &mut self,
        w: &mut W,
        first: bool,
    ) -> io::Result<()> {
        self.0.begin_array_value(w, first)
    }
    fn end_array_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_array_value(w)
    }
    fn begin_object<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.begin_object(w)
    }
    fn end_object<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_object(w)
    }
    fn begin_object_key<W: ?Sized + io::Write>(
        &mut self,
        w: &mut W,
        first: bool,
    ) -> io::Result<()> {
        self.0.begin_object_key(w, first)
    }
    fn begin_object_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        w.write_all(b" : ")
    }
    fn end_object_value<W: ?Sized + io::Write>(&mut self, w: &mut W) -> io::Result<()> {
        self.0.end_object_value(w)
    }
}

/// `value` as Xcode-style JSON text with a final newline.
pub fn xcode_json(value: &Value) -> String {
    let mut out = Vec::new();
    let mut ser = serde_json::Serializer::with_formatter(
        &mut out,
        XcodeFormatter(serde_json::ser::PrettyFormatter::new()),
    );
    value
        .serialize(&mut ser)
        .expect("JSON values always serialise");
    String::from_utf8(out).expect("JSON is UTF-8") + "\n"
}

fn ios_entry(file: &str, appearance: Option<&str>) -> Value {
    let mut e = serde_json::Map::new();
    if let Some(a) = appearance {
        e.insert(
            "appearances".into(),
            json!([{ "appearance": "luminosity", "value": a }]),
        );
    }
    e.insert("filename".into(), json!(file));
    e.insert("idiom".into(), json!("universal"));
    e.insert("platform".into(), json!("ios"));
    e.insert("size".into(), json!("1024x1024"));
    Value::Object(e)
}

/// The plan of an icon set (see the module comment); `appearances` besides `light`: `dark`,
/// `tinted` (others are refused, `light` is ignored – it is always there).
pub fn plan(
    ios: bool,
    appearances: &[String],
    macos: bool,
    watchos: bool,
) -> Result<PackagePlan, FsError> {
    if !ios && !macos && !watchos {
        return Err(invalid("no platform"));
    }
    if let Some(a) = appearances
        .iter()
        .find(|a| !matches!(a.as_str(), "light" | "dark" | "tinted"))
    {
        return Err(invalid(format!("unknown appearance {a}")));
    }
    let mut images = Vec::new();
    let mut files = Vec::new();
    if ios {
        images.push(ios_entry("ios-1024.png", None));
        files.push(PlannedFile::png(
            "ios-1024.png",
            source::IOS_LIGHT,
            1024,
            Some(WHITE),
        ));
        for (a, id) in [("dark", source::IOS_DARK), ("tinted", source::IOS_TINTED)] {
            if appearances.iter().any(|x| x == a) {
                let name = format!("ios-1024-{a}.png");
                images.push(ios_entry(&name, Some(a)));
                files.push(PlannedFile::png(name, id, 1024, None));
            }
        }
    }
    if macos {
        for pt in MAC_POINTS {
            for scale in [1, 2] {
                let name = format!("mac-{pt}x{pt}@{scale}x.png");
                images.push(json!({
                    "filename": name,
                    "idiom": "mac",
                    "scale": format!("{scale}x"),
                    "size": format!("{pt}x{pt}"),
                }));
                files.push(PlannedFile::png(name, source::MACOS, pt * scale, None));
            }
        }
    }
    if watchos {
        images.push(json!({
            "filename": "watchos-1024.png",
            "idiom": "universal",
            "platform": "watchos",
            "size": "1024x1024",
        }));
        files.push(PlannedFile::png(
            "watchos-1024.png",
            source::WATCHOS,
            1024,
            Some(BLACK),
        ));
    }
    let contents = json!({
        "images": images,
        "info": { "author": "xcode", "version": 1 },
    });
    files.insert(0, PlannedFile::text("Contents.json", xcode_json(&contents)));
    Ok(PackagePlan {
        folder: Some(FOLDER.into()),
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::package::Content;

    /// The reference `Contents.json` with all platforms and appearances.
    const SNAPSHOT: &str =
        include_str!("../../../../testdata/export/AppIcon.appiconset.Contents.json");

    fn all() -> Vec<String> {
        vec!["light".into(), "dark".into(), "tinted".into()]
    }

    fn contents(plan: &PackagePlan) -> &str {
        match &plan.files[0].content {
            Content::Text(t) => t,
            _ => panic!("Contents.json first"),
        }
    }

    #[test]
    fn contents_json_matches_the_snapshot() {
        let p = plan(true, &all(), true, true).unwrap();
        assert_eq!(p.folder.as_deref(), Some(FOLDER));
        assert_eq!(contents(&p), SNAPSHOT);
        // every file named in Contents.json is planned, and the other way round
        let json: Value = serde_json::from_str(SNAPSHOT).unwrap();
        let mut named: Vec<&str> = json["images"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["filename"].as_str().unwrap())
            .collect();
        named.insert(0, "Contents.json");
        let planned: Vec<&str> = p.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(named, planned);
        assert_eq!(planned.len(), 1 + 3 + 10 + 1);
    }

    #[test]
    fn sizes_sources_and_flattening() {
        let p = plan(true, &[], true, false).unwrap();
        let png = |name: &str| {
            p.files
                .iter()
                .find(|f| f.path == name)
                .map(|f| f.content.clone())
                .unwrap()
        };
        assert_eq!(
            png("ios-1024.png"),
            Content::Png {
                source: "ios-light".into(),
                size: 1024,
                background: Some(WHITE)
            }
        );
        assert_eq!(
            png("mac-512x512@2x.png"),
            Content::Png {
                source: "macos".into(),
                size: 1024,
                background: None
            }
        );
        assert_eq!(
            png("mac-16x16@2x.png"),
            Content::Png {
                source: "macos".into(),
                size: 32,
                background: None
            }
        );
        assert!(!contents(&p).contains("luminosity"));
        assert!(!contents(&p).contains("watchos"));
    }

    #[test]
    fn bad_requests() {
        assert!(plan(false, &[], false, false).is_err());
        assert!(plan(true, &["clear".into()], false, false).is_err());
        // macOS alone: no iOS entries
        let p = plan(false, &all(), true, false).unwrap();
        assert!(!contents(&p).contains("\"ios\""));
    }
}
