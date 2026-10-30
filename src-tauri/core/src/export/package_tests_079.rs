//! Package exports of prompt 079 on disk: Android set and web set.

use super::*;
use crate::export::containers::read_ico;
use crate::export::{android, web};
use crate::icon::image_file::{ImageKind, detect};
use resvg::tiny_skia::Pixmap;

const SQUARE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#f80"/></svg>"##;
const ROUND: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="400" fill="#08f"/></svg>"##;
/// A favicon as the frontend builds it (light and dark, `prefers-color-scheme`).
const FAVICON: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><style>.ai-dark{display:none}@media (prefers-color-scheme: dark){.ai-light{display:none}.ai-dark{display:inline}}</style><g class="ai-light"><rect width="1024" height="1024" fill="#fff"/></g><g class="ai-dark"><rect width="1024" height="1024" fill="#000"/></g></svg>"##;
/// The maskable source as the frontend builds it (design 079 E7): the fill bleeds to the edges,
/// the canvas (here a full red square) is scaled to 80 % – inside the safe zone's square.
const MASKABLE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(102.4 102.4) scale(0.8)"><rect x="-128" y="-128" width="1280" height="1280" fill="#0a0"/><rect width="1024" height="1024" fill="#f00"/></g></svg>"##;

fn src(id: &str, svg: &str) -> PackageSource {
    PackageSource {
        id: id.into(),
        svg: svg.into(),
    }
}

fn run(kind: &PackageKind, sources: &[PackageSource], dir: &Path) -> ExportReport {
    export_package(
        kind,
        sources,
        dir,
        &ExportOptions {
            base_name: "Camscanner".into(),
            overwrite: false,
        },
        Arc::new(Database::new()),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap()
}

fn color_type(png: &[u8]) -> u8 {
    png[25]
}

fn android_sources(monochrome: bool) -> Vec<PackageSource> {
    let mut s = vec![
        src(source::ANDROID_FOREGROUND, ROUND),
        src(source::ANDROID_BACKGROUND, SQUARE),
        src(source::ANDROID_LEGACY, ROUND),
        src(source::ANDROID_ROUND, ROUND),
        src(source::ANDROID_PLAY, ROUND),
    ];
    if monochrome {
        s.push(src(source::ANDROID_MONOCHROME, ROUND));
    }
    s
}

#[test]
fn android_folder_structure_sizes_and_alpha() {
    let dir = tempfile::tempdir().unwrap();
    let kind = PackageKind::Android { monochrome: true };
    let report = run(&kind, &android_sources(true), dir.path());
    let root = dir.path().join(android::FOLDER);
    assert_eq!(report.folder.as_deref(), Some(root.to_str().unwrap()));
    assert_eq!(report.files.len(), 28);
    let xml = fs::read_to_string(root.join("res/mipmap-anydpi-v26/ic_launcher.xml")).unwrap();
    assert_eq!(xml, android::adaptive_xml(true));
    assert!(
        root.join("res/mipmap-anydpi-v26/ic_launcher_round.xml")
            .exists()
    );
    let read = |p: &str| fs::read(root.join(p)).unwrap();
    for (d, scale2) in android::DENSITIES {
        for (name, dp) in [
            ("ic_launcher", 48),
            ("ic_launcher_round", 48),
            ("ic_launcher_foreground", 108),
            ("ic_launcher_background", 108),
            ("ic_launcher_monochrome", 108),
        ] {
            let bytes = read(&format!("res/mipmap-{d}/{name}.png"));
            let px = android::px(dp, scale2);
            assert_eq!(
                detect(&bytes),
                Some((ImageKind::Png, Some((px, px)))),
                "{d}/{name}"
            );
        }
    }
    // foreground keeps its transparency, background and Play Store icon are RGB without alpha
    assert_eq!(
        color_type(&read("res/mipmap-xhdpi/ic_launcher_foreground.png")),
        6
    );
    assert_eq!(
        color_type(&read("res/mipmap-xhdpi/ic_launcher_background.png")),
        2
    );
    let play = read("ic_launcher-playstore.png");
    assert_eq!(color_type(&play), 2);
    assert_eq!(detect(&play), Some((ImageKind::Png, Some((512, 512)))));
    // nothing but the folder
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn android_without_monochrome_needs_no_monochrome_source() {
    let dir = tempfile::tempdir().unwrap();
    let kind = PackageKind::Android { monochrome: false };
    let report = run(&kind, &android_sources(false), dir.path());
    assert_eq!(report.files.len(), 23);
    // an unused monochrome source is refused like every unused source
    let err = export_package(
        &kind,
        &android_sources(true),
        dir.path(),
        &ExportOptions {
            base_name: "x".into(),
            overwrite: true,
        },
        Arc::new(Database::new()),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap_err();
    assert_eq!(err.code, FsErrorCode::InvalidRequest);
}

fn web_sources(favicon: &str) -> Vec<PackageSource> {
    vec![
        src(source::WEB_ANY, ROUND),
        src(source::WEB_FAVICON, favicon),
        src(source::WEB_TOUCH, ROUND),
        src(source::WEB_MASKABLE, MASKABLE),
    ]
}

#[test]
fn web_folder_with_favicons_manifest_and_safe_zone() {
    let dir = tempfile::tempdir().unwrap();
    let report = run(&PackageKind::Web, &web_sources(FAVICON), dir.path());
    let root = dir.path().join(web::FOLDER);
    assert_eq!(report.files.len(), 8);
    let read = |p: &str| fs::read(root.join(p)).unwrap();
    // favicon.svg as the frontend built it, byte for byte
    assert_eq!(read("favicon.svg"), FAVICON.as_bytes());
    assert_eq!(
        String::from_utf8(read("manifest.webmanifest")).unwrap(),
        web::MANIFEST
    );
    assert_eq!(
        String::from_utf8(read("snippet.html")).unwrap(),
        web::SNIPPET
    );
    let ico = read_ico(&read("favicon.ico")).unwrap();
    assert_eq!(
        ico.iter().map(|(s, _)| *s).collect::<Vec<_>>(),
        web::FAVICON_SIZES
    );
    for (name, size, ct) in [
        ("apple-touch-icon.png", 180, 2),
        ("icon-192.png", 192, 6),
        ("icon-512.png", 512, 6),
        ("icon-maskable-512.png", 512, 2),
    ] {
        let bytes = read(name);
        assert_eq!(
            detect(&bytes),
            Some((ImageKind::Png, Some((size, size)))),
            "{name}"
        );
        assert_eq!(color_type(&bytes), ct, "{name}");
    }
    // touch icon: transparent corner flattened onto white
    let touch = Pixmap::decode_png(&read("apple-touch-icon.png")).unwrap();
    let c = touch.pixel(0, 0).unwrap();
    assert_eq!((c.red(), c.green(), c.alpha()), (255, 255, 255));
    // maskable: outside the safe zone (radius 40 %) only the fill, the canvas inside it
    let m = Pixmap::decode_png(&read("icon-maskable-512.png")).unwrap();
    let rgb = |x: u32, y: u32| {
        let p = m.pixel(x, y).unwrap();
        (p.red(), p.green(), p.blue(), p.alpha())
    };
    let fill = (0, 170, 0, 255);
    for (x, y) in [
        (0, 0),
        (256, 10),
        (10, 256),
        (500, 256),
        (256, 500),
        (511, 511),
    ] {
        assert_eq!(rgb(x, y), fill, "({x}, {y}) is outside the safe zone");
    }
    assert_eq!(rgb(256, 256), (255, 0, 0, 255));
    assert_eq!(
        rgb(256, 256 - 200),
        (255, 0, 0, 255),
        "inside the 40 % radius"
    );
}

#[test]
fn favicon_svg_must_be_valid() {
    let dir = tempfile::tempdir().unwrap();
    let err = export_package(
        &PackageKind::Web,
        &web_sources("<svg"),
        dir.path(),
        &ExportOptions {
            base_name: "x".into(),
            overwrite: false,
        },
        Arc::new(Database::new()),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap_err();
    assert_eq!(err.code, FsErrorCode::InvalidSvg);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn new_kinds_are_serialised_with_a_kind_tag() {
    let a: PackageKind = serde_json::from_str(r#"{"kind":"android","monochrome":true}"#).unwrap();
    assert_eq!(a, PackageKind::Android { monochrome: true });
    let w: PackageKind = serde_json::from_str(r#"{"kind":"web"}"#).unwrap();
    assert_eq!(w, PackageKind::Web);
}
