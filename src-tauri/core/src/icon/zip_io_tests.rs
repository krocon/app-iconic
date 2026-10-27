use super::*;
use crate::icon::testdata::{camscanner, camscanner_zip, make_zip, tree};
use crate::icon::{IconWarningCode, bundle::read_bundle};
use tempfile::tempdir;

fn write_tmp(dir: &Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let p = dir.join(name);
    fs::write(&p, bytes).unwrap();
    p
}

fn code(bytes: &[u8], limits: &Limits) -> FsErrorCode {
    let dir = tempdir().unwrap();
    let p = write_tmp(dir.path(), "x.icon", bytes);
    read_zip(&p, limits).unwrap_err().code
}

/// Entry contents of a ZIP, name → bytes.
fn entries(bytes: &[u8]) -> std::collections::BTreeMap<String, Vec<u8>> {
    let mut a = ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..a.len())
        .map(|i| {
            let mut f = a.by_index(i).unwrap();
            let mut b = Vec::new();
            io::Read::read_to_end(&mut f, &mut b).unwrap();
            (f.name().to_owned(), b)
        })
        .collect()
}

/// Sets a header field (u16 at `local`/`central` offsets) in every local and central header.
fn patch_headers(zip: &mut [u8], local: usize, central: usize, f: impl Fn(u16) -> u16) {
    let mut i = 0;
    while i + 4 <= zip.len() {
        let off = match &zip[i..i + 4] {
            b"PK\x03\x04" => Some(local),
            b"PK\x01\x02" => Some(central),
            _ => None,
        };
        if let Some(o) = off {
            let v = u16::from_le_bytes([zip[i + o], zip[i + o + 1]]);
            zip[i + o..i + o + 2].copy_from_slice(&f(v).to_le_bytes());
        }
        i += 1;
    }
}

#[test]
fn reads_and_round_trips_the_fixture_as_zip() {
    let dir = tempdir().unwrap();
    for root in ["", "camscanner.icon/"] {
        let src = write_tmp(dir.path(), "in.icon", &camscanner_zip(root));
        let f = read_zip(&src, &Limits::default()).unwrap();
        assert_eq!(f.format, IconFormat::Zip);
        assert_eq!(f.zip_root, root);
        let bundle = read_bundle(&camscanner(), &Limits::default()).unwrap();
        assert_eq!(f.json_bytes, bundle.json_bytes);
        assert_eq!(f.assets, bundle.assets);
        let out = dir.path().join("out.icon");
        write_zip(&out, &f).unwrap();
        assert_eq!(
            entries(&fs::read(&out).unwrap()),
            entries(&fs::read(&src).unwrap())
        );
    }
}

#[test]
fn keeps_entries_outside_the_root() {
    let dir = tempdir().unwrap();
    let json = fs::read(camscanner().join("icon.json")).unwrap();
    let zip = make_zip(&[
        ("X.icon/", b""),
        ("X.icon/icon.json", &json),
        ("X.icon/Assets/logo-scanner 3.svg", b"<svg/>"),
        ("X.icon/readme.txt", b"r"),
        ("__MACOSX/X.icon/._icon.json", b"mac"),
    ]);
    let src = write_tmp(dir.path(), "in.icon", &zip);
    let f = read_zip(&src, &Limits::default()).unwrap();
    assert_eq!(f.zip_root, "X.icon/");
    assert_eq!(f.extra_files[0].path, "readme.txt");
    assert_eq!(f.outside_root[0].path, "__MACOSX/X.icon/._icon.json");
    assert_eq!(f.warnings[0].code, IconWarningCode::MissingAsset);
    let out = dir.path().join("out.icon");
    write_zip(&out, &f).unwrap();
    let mut expected = entries(&zip);
    expected.remove("X.icon/");
    assert_eq!(entries(&fs::read(&out).unwrap()), expected);
}

#[test]
fn rejects_unsafe_entry_names() {
    let json = br#"{"groups":[]}"#;
    for bad in [
        "../evil.svg",
        "/abs.svg",
        "Assets/../../x",
        "C:/x",
        "a\\..\\b",
        "./icon.json",
    ] {
        let zip = make_zip(&[("icon.json", json), (bad, b"x")]);
        assert_eq!(
            code(&zip, &Limits::default()),
            FsErrorCode::InvalidIcon,
            "{bad}"
        );
    }
}

#[test]
fn enforces_limits() {
    let json = br#"{"groups":[]}"#;
    let big = vec![0u8; 2 * 1024 * 1024];
    let small = Limits {
        max_file: 1024 * 1024,
        ..Limits::default()
    };
    let zip = make_zip(&[("icon.json", json), ("Assets/a.svg", &big)]);
    assert_eq!(code(&zip, &small), FsErrorCode::TooLarge);

    // a bomb that lies about its size: declared 10 bytes, really 2 MiB
    let mut lying = zip.clone();
    patch_lying_size(&mut lying);
    assert_eq!(code(&lying, &small), FsErrorCode::TooLarge);

    let total = Limits {
        max_total: 1024 * 1024,
        ..Limits::default()
    };
    let half = vec![0u8; 600 * 1024];
    let zip = make_zip(&[
        ("icon.json", json),
        ("Assets/a.svg", &half),
        ("Assets/b.svg", &half),
    ]);
    assert_eq!(code(&zip, &total), FsErrorCode::TooLarge);

    let names: Vec<String> = (0..20).map(|i| format!("Assets/{i}.svg")).collect();
    let mut many: Vec<(&str, &[u8])> = names.iter().map(|n| (n.as_str(), &b"x"[..])).collect();
    many.push(("icon.json", json));
    let few = Limits {
        max_entries: 10,
        ..Limits::default()
    };
    assert_eq!(code(&make_zip(&many), &few), FsErrorCode::TooLarge);
}

/// Uncompressed size (u32) of `Assets/a.svg` → 10, in the local and the central header.
fn patch_lying_size(zip: &mut [u8]) {
    let size = (2u32 * 1024 * 1024).to_le_bytes();
    let mut i = 0;
    while i + 4 <= zip.len() {
        let off = match &zip[i..i + 4] {
            b"PK\x03\x04" => Some(22),
            b"PK\x01\x02" => Some(24),
            _ => None,
        };
        if let Some(o) = off
            && zip[i + o..i + o + 4] == size
        {
            zip[i + o..i + o + 4].copy_from_slice(&10u32.to_le_bytes());
        }
        i += 1;
    }
}

#[test]
fn encrypted_or_unknown_compression_is_unsupported() {
    let json = br#"{"groups":[]}"#;
    let zip = make_zip(&[("icon.json", json)]);
    let mut enc = zip.clone();
    patch_headers(&mut enc, 6, 8, |v| v | 1);
    assert_eq!(code(&enc, &Limits::default()), FsErrorCode::UnsupportedIcon);
    let mut bz = zip;
    patch_headers(&mut bz, 8, 10, |_| 12); // bzip2 – not compiled in
    assert_eq!(code(&bz, &Limits::default()), FsErrorCode::UnsupportedIcon);
}

#[test]
fn broken_or_empty_archives_are_invalid() {
    assert_eq!(
        code(b"not a zip", &Limits::default()),
        FsErrorCode::InvalidIcon
    );
    let no_json = make_zip(&[("Assets/a.svg", b"<svg/>")]);
    assert_eq!(code(&no_json, &Limits::default()), FsErrorCode::InvalidIcon);
    let two_roots = make_zip(&[("a/icon.json", b"{}"), ("b/icon.json", b"{}")]);
    assert_eq!(
        code(&two_roots, &Limits::default()),
        FsErrorCode::InvalidIcon
    );
    let bad_json = make_zip(&[("icon.json", b"{ nope")]);
    assert_eq!(
        code(&bad_json, &Limits::default()),
        FsErrorCode::InvalidIcon
    );
}

#[test]
fn unicode_names_survive() {
    let dir = tempdir().unwrap();
    let json = r#"{"groups":[{"layers":[{"image-name":"Größe 😀.svg"}]}]}"#;
    let nfd = "Gro\u{308}ße 😀.svg";
    let zip = make_zip(&[
        ("icon.json", json.as_bytes()),
        (&format!("Assets/{nfd}"), b"<svg/>"),
    ]);
    let src = write_tmp(dir.path(), "u.icon", &zip);
    let f = read_zip(&src, &Limits::default()).unwrap();
    assert_eq!(f.assets[0].name, nfd);
    assert!(f.warnings.is_empty(), "NFD file matches the NFC image-name");
    let out = dir.path().join("out.icon");
    write_zip(&out, &f).unwrap();
    assert!(entries(&fs::read(&out).unwrap()).contains_key(&format!("Assets/{nfd}")));
}

#[test]
fn zip_over_a_bundle_folder_and_bundle_over_zip() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("doc.icon");
    crate::icon::testdata::copy_tree(&camscanner(), &target);
    let mut f = read_bundle(&target, &Limits::default()).unwrap();
    f.format = IconFormat::Zip;
    write_zip(&target, &f).unwrap();
    assert!(target.is_file());
    let back = read_zip(&target, &Limits::default()).unwrap();
    assert_eq!(back.assets, f.assets);
    let mut b = back;
    b.format = IconFormat::Bundle;
    crate::icon::write_icon(&target, &b).unwrap();
    assert_eq!(tree(&target), tree(&camscanner()));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

/// Replaces every occurrence of `from` by `to` (same length) – names in local and central headers.
fn rename_in_place(zip: &mut [u8], from: &[u8], to: &[u8]) {
    assert_eq!(from.len(), to.len());
    let mut i = 0;
    while i + from.len() <= zip.len() {
        if &zip[i..i + from.len()] == from {
            zip[i..i + from.len()].copy_from_slice(to);
        }
        i += 1;
    }
}

#[test]
fn the_same_entry_twice_is_invalid() {
    let json = br#"{"groups":[]}"#;
    let mut zip = make_zip(&[
        ("icon.json", json),
        ("Assets/a.svg", b"1"),
        ("Assets/b.svg", b"2"),
    ]);
    rename_in_place(&mut zip, b"Assets/b.svg", b"Assets/a.svg");
    assert_eq!(code(&zip, &Limits::default()), FsErrorCode::InvalidIcon);
}

#[test]
fn a_file_bigger_than_the_total_limit_is_not_opened() {
    let json = br#"{"groups":[]}"#;
    let mut zip = make_zip(&[("icon.json", json)]);
    zip.extend(vec![0u8; 4096]); // junk after the archive still counts
    let small = Limits {
        max_total: 1024,
        ..Limits::default()
    };
    assert_eq!(code(&zip, &small), FsErrorCode::TooLarge);
}

#[test]
fn names_a_case_insensitive_file_system_cannot_keep_apart_are_left_out() {
    let json = br#"{"groups":[]}"#;
    let zip = make_zip(&[
        ("icon.json", json),
        ("Assets/a.svg", b"1"),
        ("Assets/A.svg", b"2"),
        ("ICON.JSON", b"3"),
        ("assets", b"4"),
        ("notes.txt", b"5"),
        ("notes.txt/x", b"6"),
        ("NOTES.TXT", b"7"),
        ("extra/one", b"8"),
        ("Extra/two", b"9"),
    ]);
    let dir = tempdir().unwrap();
    let f = read_zip(&write_tmp(dir.path(), "x.icon", &zip), &Limits::default()).unwrap();
    let assets: Vec<_> = f.assets.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(assets, ["a.svg"]);
    let extra: Vec<_> = f.extra_files.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(extra, ["notes.txt", "extra/one", "Extra/two"]);
    let ignored: Vec<_> = f
        .warnings
        .iter()
        .filter(|w| w.code == IconWarningCode::IgnoredEntry)
        .map(|w| w.name.as_str())
        .collect();
    assert_eq!(
        ignored,
        [
            "Assets/A.svg",
            "ICON.JSON",
            "assets",
            "notes.txt/x",
            "NOTES.TXT"
        ]
    );
    // and it saves as a bundle without one file overwriting another
    let out = dir.path().join("out.icon");
    crate::icon::bundle::write_bundle(&out, &f).unwrap();
}
