//! Android launcher icons (prompt 079, design E2–E5): a folder `android/` to merge into
//! `app/src/main/`:
//!
//! - **Adaptive icon** (API 26+): `res/mipmap-anydpi-v26/ic_launcher.xml` (+ `_round`) with
//!   `background`, `foreground` and – optional – `monochrome` (themed icons, API 33). Android
//!   Developers, "Adaptive icons": "Size all layers to 108x108 dp", the outer 18 dp per side are
//!   reserved for masks and effects, the inner 66 × 66 dp are never clipped. The layers as PNGs in
//!   `res/mipmap-<density>/`, 108 dp × density scale (mdpi 1, hdpi 1.5, xhdpi 2, xxhdpi 3,
//!   xxxhdpi 4). The `.icon` canvas becomes the 72 dp viewport (design E3); the frontend builds
//!   the sources that way.
//! - **Legacy icons** (before API 26): `ic_launcher.png` (squircle) and `ic_launcher_round.png`
//!   (circle), 48 dp per density = 48, 72, 96, 144, 192 px.
//! - **Google Play**: `ic_launcher-playstore.png`, 512 × 512, full square without transparency
//!   (Google Play icon design specifications: "Full square – Google Play dynamically handles
//!   masking"; transparent assets show the UI colour behind them).

use super::package::{PackagePlan, PlannedFile, source};

/// The folder (merged into `app/src/main/`).
pub const FOLDER: &str = "android";

/// Size of the adaptive layers in dp; of the legacy icon in dp.
pub const LAYER_DP: u32 = 108;
pub const LEGACY_DP: u32 = 48;
/// Google Play icon in px.
pub const PLAY_SIZE: u32 = 512;

/// Density buckets and their scale × 2 (hdpi = 1.5 stays an integer).
pub const DENSITIES: [(&str, u32); 5] = [
    ("mdpi", 2),
    ("hdpi", 3),
    ("xhdpi", 4),
    ("xxhdpi", 6),
    ("xxxhdpi", 8),
];

const WHITE: [u8; 3] = [255, 255, 255];

/// `ic_launcher.xml` / `ic_launcher_round.xml` (the same content).
pub fn adaptive_xml(monochrome: bool) -> String {
    let mut s = String::from(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\
         <adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    \
         <background android:drawable=\"@mipmap/ic_launcher_background\" />\n    \
         <foreground android:drawable=\"@mipmap/ic_launcher_foreground\" />\n",
    );
    if monochrome {
        s.push_str("    <monochrome android:drawable=\"@mipmap/ic_launcher_monochrome\" />\n");
    }
    s.push_str("</adaptive-icon>\n");
    s
}

/// Pixels of `dp` at a density with `scale2` = scale × 2.
pub fn px(dp: u32, scale2: u32) -> u32 {
    dp * scale2 / 2
}

/// The plan of the Android set (see the module comment).
pub fn plan(monochrome: bool) -> PackagePlan {
    let xml = adaptive_xml(monochrome);
    let mut files = vec![
        PlannedFile::text("res/mipmap-anydpi-v26/ic_launcher.xml", xml.clone()),
        PlannedFile::text("res/mipmap-anydpi-v26/ic_launcher_round.xml", xml),
    ];
    for (density, scale2) in DENSITIES {
        let dir = format!("res/mipmap-{density}");
        let legacy = px(LEGACY_DP, scale2);
        let layer = px(LAYER_DP, scale2);
        files.push(PlannedFile::png(
            format!("{dir}/ic_launcher.png"),
            source::ANDROID_LEGACY,
            legacy,
            None,
        ));
        files.push(PlannedFile::png(
            format!("{dir}/ic_launcher_round.png"),
            source::ANDROID_ROUND,
            legacy,
            None,
        ));
        files.push(PlannedFile::png(
            format!("{dir}/ic_launcher_foreground.png"),
            source::ANDROID_FOREGROUND,
            layer,
            None,
        ));
        // the background layer is opaque: flattened onto white (like Android's "any" icons)
        files.push(PlannedFile::png(
            format!("{dir}/ic_launcher_background.png"),
            source::ANDROID_BACKGROUND,
            layer,
            Some(WHITE),
        ));
        if monochrome {
            files.push(PlannedFile::png(
                format!("{dir}/ic_launcher_monochrome.png"),
                source::ANDROID_MONOCHROME,
                layer,
                None,
            ));
        }
    }
    files.push(PlannedFile::png(
        "ic_launcher-playstore.png",
        source::ANDROID_PLAY,
        PLAY_SIZE,
        Some(WHITE),
    ));
    PackagePlan {
        folder: Some(FOLDER.into()),
        files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::package::Content;

    const SNAPSHOT: &str = include_str!("../../../../testdata/export/android/ic_launcher.xml");

    fn png(p: &PackagePlan, path: &str) -> (String, u32, Option<[u8; 3]>) {
        match &p.files.iter().find(|f| f.path == path).unwrap().content {
            Content::Png {
                source,
                size,
                background,
            } => (source.clone(), *size, *background),
            c => panic!("{path}: {c:?}"),
        }
    }

    #[test]
    fn adaptive_xml_matches_the_snapshot() {
        assert_eq!(adaptive_xml(true), SNAPSHOT);
        let without = adaptive_xml(false);
        assert!(!without.contains("monochrome"));
        assert_eq!(without.lines().count(), SNAPSHOT.lines().count() - 1);
        let p = plan(true);
        for f in &p.files[..2] {
            assert_eq!(f.content, Content::Text(SNAPSHOT.into()), "{}", f.path);
        }
    }

    #[test]
    fn sizes_per_density() {
        let p = plan(true);
        assert_eq!(p.folder.as_deref(), Some(FOLDER));
        // 2 XML + 5 densities × 5 PNGs + Play Store
        assert_eq!(p.files.len(), 2 + 25 + 1);
        let layers: Vec<u32> = DENSITIES
            .iter()
            .map(|(d, _)| png(&p, &format!("res/mipmap-{d}/ic_launcher_foreground.png")).1)
            .collect();
        assert_eq!(layers, [108, 162, 216, 324, 432]);
        let legacy: Vec<u32> = DENSITIES
            .iter()
            .map(|(d, _)| png(&p, &format!("res/mipmap-{d}/ic_launcher.png")).1)
            .collect();
        assert_eq!(legacy, [48, 72, 96, 144, 192]);
        assert_eq!(
            png(&p, "res/mipmap-xxxhdpi/ic_launcher_round.png"),
            ("android-round".into(), 192, None)
        );
        assert_eq!(
            png(&p, "res/mipmap-hdpi/ic_launcher_background.png"),
            ("android-background".into(), 162, Some(WHITE))
        );
        assert_eq!(
            png(&p, "res/mipmap-xhdpi/ic_launcher_monochrome.png"),
            ("android-monochrome".into(), 216, None)
        );
        assert_eq!(
            png(&p, "ic_launcher-playstore.png"),
            ("android-play".into(), 512, Some(WHITE))
        );
    }

    #[test]
    fn without_monochrome() {
        let p = plan(false);
        assert_eq!(p.files.len(), 2 + 20 + 1);
        assert!(!p.files.iter().any(|f| f.path.contains("monochrome")));
    }
}
