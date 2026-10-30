use super::*;
use crate::export::appiconset::FOLDER;
use crate::export::containers::{read_icns, read_ico};
use crate::icon::image_file::{ImageKind, detect};

const SQUARE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#f80"/></svg>"##;
/// Transparent corners – flattening must remove the alpha channel.
const ROUND: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="400" fill="#08f"/></svg>"##;

fn fonts() -> Arc<Database> {
    Arc::new(Database::new())
}

fn opts(overwrite: bool) -> ExportOptions {
    ExportOptions {
        base_name: "Camscanner".into(),
        overwrite,
    }
}

fn src(id: &str, svg: &str) -> PackageSource {
    PackageSource {
        id: id.into(),
        svg: svg.into(),
    }
}

fn all_sets() -> (PackageKind, Vec<PackageSource>) {
    (
        PackageKind::AppIconSet {
            ios: true,
            appearances: vec!["dark".into(), "tinted".into()],
            macos: true,
            watchos: true,
        },
        vec![
            src(source::IOS_LIGHT, ROUND),
            src(source::IOS_DARK, ROUND),
            src(source::IOS_TINTED, ROUND),
            src(source::MACOS, ROUND),
            src(source::WATCHOS, ROUND),
        ],
    )
}

fn run(
    kind: &PackageKind,
    sources: &[PackageSource],
    dir: &Path,
    overwrite: bool,
) -> Result<ExportReport, FsError> {
    export_package(
        kind,
        sources,
        dir,
        &opts(overwrite),
        fonts(),
        &AtomicBool::new(false),
        |_| {},
    )
}

/// Colour type byte of the IHDR chunk (2 = RGB, 6 = RGBA).
fn color_type(png: &[u8]) -> u8 {
    png[25]
}

#[test]
fn appiconset_folder_with_contents_sizes_and_alpha() {
    let dir = tempfile::tempdir().unwrap();
    let (kind, sources) = all_sets();
    let mut seen = Vec::new();
    let report = export_package(
        &kind,
        &sources,
        dir.path(),
        &opts(false),
        fonts(),
        &AtomicBool::new(false),
        |p| seen.push((p.done, p.total)),
    )
    .unwrap();
    let set = dir.path().join(FOLDER);
    assert_eq!(report.folder.as_deref(), Some(set.to_str().unwrap()));
    assert_eq!(report.files.len(), 15);
    assert_eq!(seen.last(), Some(&(15, 15)));
    let json: serde_json::Value =
        serde_json::from_slice(&fs::read(set.join("Contents.json")).unwrap()).unwrap();
    for img in json["images"].as_array().unwrap() {
        let name = img["filename"].as_str().unwrap();
        let bytes = fs::read(set.join(name)).unwrap();
        let (kind, size) = detect(&bytes).unwrap();
        assert_eq!(kind, ImageKind::Png, "{name}");
        // pixel size = points × scale
        let pt: u32 = img["size"]
            .as_str()
            .unwrap()
            .split('x')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        let scale: u32 = img["scale"]
            .as_str()
            .map_or(1, |s| s.trim_end_matches('x').parse().unwrap());
        assert_eq!(size, Some((pt * scale, pt * scale)), "{name}");
    }
    // App Store icons: RGB without alpha; dark/tinted/macOS keep it
    let ct = |n: &str| color_type(&fs::read(set.join(n)).unwrap());
    assert_eq!(ct("ios-1024.png"), 2);
    assert_eq!(ct("watchos-1024.png"), 2);
    assert_eq!(ct("ios-1024-dark.png"), 6);
    assert_eq!(ct("mac-512x512@2x.png"), 6);
    let file = |n: &str| report.files.iter().find(|f| f.name == n).unwrap();
    assert_eq!(file("ios-1024.png").transparent, Some(false));
    assert_eq!(file("ios-1024-dark.png").transparent, Some(true));
    assert_eq!(file("Contents.json").transparent, None);
    // flattened onto white (iOS) / black (watchOS): the transparent corner
    let corner = |n: &str| {
        let p = Pixmap::decode_png(&fs::read(set.join(n)).unwrap()).unwrap();
        let c = p.pixel(0, 0).unwrap();
        (c.red(), c.alpha())
    };
    assert_eq!(corner("ios-1024.png"), (255, 255));
    assert_eq!(corner("watchos-1024.png"), (0, 255));
    // no temporary folder left behind
    let left: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
    assert_eq!(left.len(), 1);
}

#[test]
fn existing_set_needs_overwrite_and_is_replaced_whole() {
    let dir = tempfile::tempdir().unwrap();
    let set = dir.path().join(FOLDER);
    fs::create_dir(&set).unwrap();
    fs::write(set.join("old.png"), b"x").unwrap();
    let kind = PackageKind::AppIconSet {
        ios: true,
        appearances: vec![],
        macos: false,
        watchos: false,
    };
    let sources = vec![src(source::IOS_LIGHT, SQUARE)];
    let err = run(&kind, &sources, dir.path(), false).unwrap_err();
    assert_eq!(err.code, FsErrorCode::AlreadyExists);
    assert!(set.join("old.png").exists(), "nothing touched");
    run(&kind, &sources, dir.path(), true).unwrap();
    assert!(!set.join("old.png").exists(), "the folder is replaced");
    assert!(set.join("ios-1024.png").exists());
}

#[test]
fn cancel_leaves_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let (kind, sources) = all_sets();
    let cancel = AtomicBool::new(false);
    let report = export_package(
        &kind,
        &sources,
        dir.path(),
        &opts(false),
        fonts(),
        &cancel,
        |p| {
            if p.done == 3 {
                cancel.store(true, Ordering::SeqCst);
            }
        },
    )
    .unwrap();
    assert!(report.cancelled);
    assert!(report.files.is_empty());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn icns_and_ico_read_back() {
    let dir = tempfile::tempdir().unwrap();
    let r = run(
        &PackageKind::Icns,
        &[src(source::MACOS, ROUND)],
        dir.path(),
        false,
    )
    .unwrap();
    assert_eq!(r.files[0].name, "Camscanner.icns");
    let icns = read_icns(&fs::read(dir.path().join("Camscanner.icns")).unwrap()).unwrap();
    assert_eq!(icns.len(), ICNS_TYPES.len());
    for ((ty, data), (want, size)) in icns.iter().zip(ICNS_TYPES) {
        assert_eq!(ty, want);
        assert_eq!(detect(data), Some((ImageKind::Png, Some((size, size)))));
    }
    run(
        &PackageKind::Ico,
        &[src(source::WINDOWS, SQUARE)],
        dir.path(),
        false,
    )
    .unwrap();
    let ico = read_ico(&fs::read(dir.path().join("Camscanner.ico")).unwrap()).unwrap();
    let sizes: Vec<u32> = ico.iter().map(|(s, _)| *s).collect();
    assert_eq!(sizes, ICO_SIZES);
    for (size, data) in &ico {
        assert_eq!(detect(data), Some((ImageKind::Png, Some((*size, *size)))));
    }
    // a second export without overwrite
    let err = run(
        &PackageKind::Ico,
        &[src(source::WINDOWS, SQUARE)],
        dir.path(),
        false,
    )
    .unwrap_err();
    assert_eq!(err.code, FsErrorCode::AlreadyExists);
}

#[test]
fn sources_must_fit_the_plan() {
    let dir = tempfile::tempdir().unwrap();
    let code = |kind: &PackageKind, sources: &[PackageSource]| {
        run(kind, sources, dir.path(), false).unwrap_err().code
    };
    // missing, unused, twice
    assert_eq!(code(&PackageKind::Icns, &[]), FsErrorCode::InvalidRequest);
    assert_eq!(
        code(
            &PackageKind::Icns,
            &[src(source::MACOS, SQUARE), src(source::WINDOWS, SQUARE)]
        ),
        FsErrorCode::InvalidRequest
    );
    assert_eq!(
        code(
            &PackageKind::Icns,
            &[src(source::MACOS, SQUARE), src(source::MACOS, SQUARE)]
        ),
        FsErrorCode::InvalidRequest
    );
    assert_eq!(
        code(&PackageKind::Icns, &[src(source::MACOS, "<svg")]),
        FsErrorCode::InvalidSvg
    );
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn kinds_are_serialised_with_a_kind_tag() {
    let (kind, _) = all_sets();
    let json = serde_json::to_value(&kind).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "kind": "appIconSet", "ios": true, "appearances": ["dark", "tinted"],
            "macos": true, "watchos": true
        })
    );
    let ico: PackageKind = serde_json::from_str(r#"{"kind":"ico"}"#).unwrap();
    assert_eq!(ico, PackageKind::Ico);
}

#[test]
fn plan_paths_are_checked() {
    assert!(safe_relative("a/b.png"));
    for bad in ["", "../x", "a//b", "/abs", "a\\b", "c:x", "./a"] {
        assert!(!safe_relative(bad), "{bad}");
    }
}

#[test]
fn opaque_png_flattens_premultiplied_pixels() {
    let mut p = Pixmap::new(1, 1).unwrap();
    // half transparent red (premultiplied 128,0,0,128) over white → (255,127,127)
    p.fill(resvg::tiny_skia::Color::from_rgba8(255, 0, 0, 128));
    let png = encode_opaque(&p, [255, 255, 255]).unwrap();
    assert_eq!(color_type(&png), 2);
    let back = Pixmap::decode_png(&png).unwrap();
    let c = back.pixel(0, 0).unwrap();
    assert_eq!((c.red(), c.green(), c.alpha()), (255, 127, 255));
}
