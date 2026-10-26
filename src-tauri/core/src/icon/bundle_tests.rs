use super::*;
use crate::icon::testdata::{camscanner, copy_tree, tree};
use tempfile::tempdir;

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

#[test]
fn reads_the_fixture() {
    let f = read_bundle(&camscanner(), &Limits::default()).unwrap();
    assert_eq!(f.format, IconFormat::Bundle);
    let names: Vec<_> = f.assets.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(names, ["logo-scanner 3.svg", "logo-scanner-2 2.svg"]);
    assert!(f.extra_files.is_empty() && f.warnings.is_empty());
}

#[test]
fn round_trip_is_byte_identical() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("out.icon");
    let f = read_bundle(&camscanner(), &Limits::default()).unwrap();
    write_bundle(&target, &f).unwrap();
    assert_eq!(tree(&target), tree(&camscanner()));
    // and once more over the existing bundle
    write_bundle(&target, &f).unwrap();
    assert_eq!(tree(&target), tree(&camscanner()));
    assert_eq!(names(dir.path()), ["out.icon"]);
}

#[test]
fn keeps_extra_files_and_ignores_symlinks() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("in.icon");
    copy_tree(&camscanner(), &src);
    fs::write(src.join("Assets/.DS_Store"), b"ds").unwrap();
    fs::create_dir_all(src.join("Assets/sub")).unwrap();
    fs::write(src.join("Assets/sub/x.svg"), b"x").unwrap();
    fs::write(src.join("notes ü 😀.txt"), b"n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink("/etc/passwd", src.join("Assets/link.svg")).unwrap();
    let f = read_bundle(&src, &Limits::default()).unwrap();
    assert_eq!(f.assets.len(), 2);
    let extra: Vec<_> = f.extra_files.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(
        extra,
        ["Assets/.DS_Store", "Assets/sub/x.svg", "notes ü 😀.txt"]
    );
    #[cfg(unix)]
    {
        assert_eq!(f.warnings[0].code, IconWarningCode::IgnoredEntry);
        fs::remove_file(src.join("Assets/link.svg")).unwrap();
    }
    let out = dir.path().join("out.icon");
    write_bundle(&out, &f).unwrap();
    assert_eq!(tree(&out), tree(&src));
}

#[test]
fn a_failed_save_leaves_the_original_intact() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("doc.icon");
    copy_tree(&camscanner(), &target);
    let mut f = read_bundle(&target, &Limits::default()).unwrap();
    f.assets[0].bytes = b"<svg>changed</svg>".to_vec();
    let err = write_bundle_with(&target, &f, || Err(io::Error::other("power cut"))).unwrap_err();
    assert_eq!(err.code, FsErrorCode::Io);
    assert_eq!(tree(&target), tree(&camscanner()));
    assert_eq!(names(dir.path()), ["doc.icon"]);
}

#[test]
fn replaces_a_file_with_a_bundle() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("doc.icon");
    fs::write(&target, b"PK old zip").unwrap();
    let f = read_bundle(&camscanner(), &Limits::default()).unwrap();
    write_bundle(&target, &f).unwrap();
    assert_eq!(tree(&target), tree(&camscanner()));
    assert_eq!(names(dir.path()), ["doc.icon"]);
}

#[test]
fn rejects_unsafe_names_before_writing() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("doc.icon");
    let mut f = read_bundle(&camscanner(), &Limits::default()).unwrap();
    f.assets[0].name = "../evil.svg".into();
    assert_eq!(
        write_bundle(&target, &f).unwrap_err().code,
        FsErrorCode::InvalidPath
    );
    let mut f = read_bundle(&camscanner(), &Limits::default()).unwrap();
    f.extra_files.push(ExtraFile {
        path: "../x".into(),
        bytes: vec![],
    });
    assert_eq!(
        write_bundle(&target, &f).unwrap_err().code,
        FsErrorCode::InvalidIcon
    );
    assert!(names(dir.path()).is_empty());
}

#[test]
fn limits_apply_to_bundles() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("big.icon");
    copy_tree(&camscanner(), &src);
    let small = Limits {
        max_file: 1000,
        ..Limits::default()
    };
    assert_eq!(
        read_bundle(&src, &small).unwrap_err().code,
        FsErrorCode::TooLarge
    );
    let few = Limits {
        max_entries: 2,
        ..Limits::default()
    };
    assert_eq!(
        read_bundle(&src, &few).unwrap_err().code,
        FsErrorCode::TooLarge
    );
    let total = Limits {
        max_total: 2000,
        ..Limits::default()
    };
    assert_eq!(
        read_bundle(&src, &total).unwrap_err().code,
        FsErrorCode::TooLarge
    );
}

#[test]
fn a_folder_without_icon_json_is_invalid() {
    let dir = tempdir().unwrap();
    assert_eq!(
        read_bundle(dir.path(), &Limits::default())
            .unwrap_err()
            .code,
        FsErrorCode::InvalidIcon
    );
}

#[test]
fn safe_relative_paths() {
    assert!(is_safe_relative("a/b c.txt"));
    for bad in ["", "../a", "/a", "a/../b", "a\\b", "./a"] {
        assert!(!is_safe_relative(bad), "{bad}");
    }
}
