use super::*;
use resvg::tiny_skia::Pixmap;

const OPAQUE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#f80"/></svg>"##;
const ROUND: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="512" fill="#08f"/></svg>"##;

fn fonts() -> Arc<Database> {
    Arc::new(Database::new())
}

fn opts(base: &str, overwrite: bool) -> ExportOptions {
    ExportOptions {
        base_name: base.into(),
        overwrite,
    }
}

fn variants() -> Vec<Variant> {
    vec![
        Variant {
            appearance: "light".into(),
            svg: OPAQUE.into(),
        },
        Variant {
            appearance: "dark".into(),
            svg: ROUND.into(),
        },
    ]
}

#[test]
fn base_names_are_cleaned() {
    assert_eq!(file_base_name("camscanner").unwrap(), "camscanner");
    assert_eq!(file_base_name("a/b\\c:d*e?").unwrap(), "a_b_c_d_e_");
    assert_eq!(file_base_name("  ..x.. ").unwrap(), "x");
    assert_eq!(file_base_name("tab\there").unwrap(), "tab_here");
    assert_eq!(
        file_base_name("..").unwrap_err().code,
        FsErrorCode::InvalidPath
    );
    assert_eq!(
        file_base_name("").unwrap_err().code,
        FsErrorCode::InvalidPath
    );
    assert_eq!(file_base_name(&"x".repeat(500)).unwrap().len(), 120);
}

#[test]
fn png_files_names_sizes_progress_and_transparency() {
    let dir = tempfile::tempdir().unwrap();
    let mut seen = Vec::new();
    let report = export_png(
        &variants(),
        &[256, 16, 256],
        dir.path(),
        &opts("Icon", false),
        fonts(),
        &AtomicBool::new(false),
        |p| seen.push((p.done, p.total, p.name)),
    )
    .unwrap();
    assert!(!report.cancelled);
    let names: Vec<_> = report.files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "Icon-light-256.png",
            "Icon-light-16.png",
            "Icon-dark-256.png",
            "Icon-dark-16.png"
        ]
    );
    assert_eq!(seen.len(), 4);
    assert_eq!(seen[3], (4, 4, "Icon-dark-16.png".to_string()));
    for f in &report.files {
        let p = Pixmap::load_png(&f.path).unwrap();
        let size: u32 = f
            .name
            .trim_end_matches(".png")
            .rsplit('-')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!((p.width(), p.height()), (size, size));
        assert_eq!(f.transparent, Some(f.name.contains("dark")), "{}", f.name);
    }
    // no temp files left behind
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 4);
}

#[test]
fn never_overwrites_without_permission() {
    let dir = tempfile::tempdir().unwrap();
    let existing = dir.path().join("Icon-dark-16.png");
    std::fs::write(&existing, b"keep").unwrap();
    let e = export_png(
        &variants(),
        &[32, 16],
        dir.path(),
        &opts("Icon", false),
        fonts(),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap_err();
    assert_eq!(e.code, FsErrorCode::AlreadyExists);
    assert_eq!(e.path.as_deref(), Some(existing.to_str().unwrap()));
    // checked before anything is written
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    assert_eq!(std::fs::read(&existing).unwrap(), b"keep");
    let report = export_png(
        &variants(),
        &[32, 16],
        dir.path(),
        &opts("Icon", true),
        fonts(),
        &AtomicBool::new(false),
        |_| {},
    )
    .unwrap();
    assert_eq!(report.files.len(), 4);
    assert_ne!(std::fs::read(&existing).unwrap(), b"keep");
}

#[test]
fn cancel_stops_between_files() {
    let dir = tempfile::tempdir().unwrap();
    let cancel = AtomicBool::new(false);
    let report = export_png(
        &variants(),
        &[64, 32, 16],
        dir.path(),
        &opts("Icon", false),
        fonts(),
        &cancel,
        |p| {
            if p.done == 2 {
                cancel.store(true, Ordering::SeqCst);
            }
        },
    )
    .unwrap();
    assert!(report.cancelled);
    assert_eq!(report.files.len(), 2);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 2);
}

#[test]
fn bad_requests_write_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let run = |v: &[Variant], sizes: &[u32], d: &Path| {
        export_png(
            v,
            sizes,
            d,
            &opts("Icon", false),
            fonts(),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap_err()
        .code
    };
    assert_eq!(
        run(&variants(), &[100], dir.path()),
        FsErrorCode::InvalidPath
    );
    assert_eq!(run(&variants(), &[], dir.path()), FsErrorCode::InvalidPath);
    assert_eq!(run(&[], &[16], dir.path()), FsErrorCode::InvalidPath);
    let twice = vec![variants()[0].clone(), variants()[0].clone()];
    assert_eq!(run(&twice, &[16], dir.path()), FsErrorCode::InvalidPath);
    let tinted = vec![Variant {
        appearance: "../tinted".into(),
        svg: OPAQUE.into(),
    }];
    assert_eq!(run(&tinted, &[16], dir.path()), FsErrorCode::InvalidPath);
    assert_eq!(
        run(&variants(), &[16], Path::new("relative")),
        FsErrorCode::InvalidPath
    );
    assert_eq!(
        run(&variants(), &[16], &dir.path().join("missing")),
        FsErrorCode::NotFound
    );
    let broken = vec![Variant {
        appearance: "light".into(),
        svg: "<svg".into(),
    }];
    assert_eq!(run(&broken, &[16], dir.path()), FsErrorCode::InvalidSvg);
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn svg_files_are_written_as_given() {
    let dir = tempfile::tempdir().unwrap();
    let report = export_svg(&variants(), dir.path(), &opts("cam scanner", false)).unwrap();
    let names: Vec<_> = report.files.iter().map(|f| f.name.clone()).collect();
    assert_eq!(names, ["cam scanner-light.svg", "cam scanner-dark.svg"]);
    assert_eq!(
        std::fs::read_to_string(dir.path().join("cam scanner-dark.svg")).unwrap(),
        ROUND
    );
    assert_eq!(report.files[0].transparent, None);
    let again = export_svg(&variants(), dir.path(), &opts("cam scanner", false)).unwrap_err();
    assert_eq!(again.code, FsErrorCode::AlreadyExists);
    assert!(export_svg(&variants(), dir.path(), &opts("cam scanner", true)).is_ok());
}
