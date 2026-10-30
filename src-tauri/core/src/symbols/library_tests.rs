use super::*;
use tempfile::tempdir;

const SQUARE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>"##;
const EVIL: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><path d="M0 0h10" onclick="x()" fill="url(https://e.example/)"/></svg>"##;

fn lib() -> (tempfile::TempDir, PathBuf) {
    let t = tempdir().unwrap();
    let dir = t.path().join(DIR_NAME);
    (t, dir)
}

#[test]
fn save_list_rename_delete() {
    let (_t, dir) = lib();
    assert!(list(&dir).is_empty());
    let a = save(&dir, " My Star ", &["Shape".into()], SQUARE).unwrap();
    assert_eq!(a.id, "my-star");
    assert_eq!(a.name, "My Star");
    assert_eq!(a.tags, vec!["shape"]);
    assert!(dir.join("my-star.svg").is_file());
    let b = save(&dir, "My Star", &[], SQUARE).unwrap();
    assert_eq!(b.id, "my-star-2");
    let c = save(&dir, "Äpfel & Birnen", &[], SQUARE).unwrap();
    assert_eq!(c.id, "pfel-birnen");
    let d = save(&dir, "★", &[], SQUARE).unwrap();
    assert_eq!(d.id, "symbol");
    let names: Vec<String> = list(&dir).into_iter().map(|s| s.name).collect();
    assert_eq!(names, vec!["My Star", "My Star", "Äpfel & Birnen", "★"]);

    let renamed = update(&dir, "my-star-2", "Other", &["x".into(), "y".into()]).unwrap();
    assert_eq!(renamed.id, "my-star-2");
    let back = list(&dir)
        .into_iter()
        .find(|s| s.id == "my-star-2")
        .unwrap();
    assert_eq!(
        (back.name.as_str(), back.tags.clone()),
        ("Other", vec!["x".into(), "y".into()])
    );
    assert_eq!(back.svg, renamed.svg);

    assert!(delete(&dir, "my-star").unwrap());
    assert!(!delete(&dir, "my-star").unwrap());
    assert_eq!(list(&dir).len(), 3);
    assert_eq!(
        update(&dir, "my-star", "x", &[]).unwrap_err().code,
        FsErrorCode::NotFound
    );
}

#[test]
fn ids_are_never_paths() {
    let (_t, dir) = lib();
    for bad in [
        "",
        "../x",
        "a/b",
        "a\\b",
        "A",
        "-a",
        "x.svg",
        &"a".repeat(49),
    ] {
        assert!(!valid_id(bad), "{bad}");
        assert_eq!(
            delete(&dir, bad).unwrap_err().code,
            FsErrorCode::InvalidRequest
        );
        assert_eq!(
            update(&dir, bad, "n", &[]).unwrap_err().code,
            FsErrorCode::InvalidRequest
        );
    }
    assert!(valid_id("my-star-2"));
}

#[test]
fn saving_cleans_hostile_svg_and_refuses_bad_input() {
    let (_t, dir) = lib();
    let s = save(&dir, "Evil", &[], EVIL).unwrap();
    let on_disk = fs::read_to_string(dir.join("evil.svg")).unwrap();
    assert_eq!(on_disk, s.svg);
    for bad in ["script", "onload", "onclick", "url"] {
        assert!(!on_disk.contains(bad), "{bad}: {on_disk}");
    }
    assert_eq!(
        save(&dir, "  ", &[], SQUARE).unwrap_err().code,
        FsErrorCode::InvalidRequest
    );
    assert_eq!(
        save(&dir, "x", &[], "<svg").unwrap_err().code,
        FsErrorCode::InvalidSvg
    );
}

#[test]
fn loading_cleans_again_and_skips_what_is_not_ours() {
    let (_t, dir) = lib();
    fs::create_dir_all(&dir).unwrap();
    // a file changed behind the app's back: cleaned on loading
    fs::write(dir.join("planted.svg"), EVIL).unwrap();
    fs::write(dir.join("broken.svg"), "<svg").unwrap();
    fs::write(dir.join("Not-An-Id.svg"), SQUARE).unwrap();
    fs::write(dir.join("notes.txt"), "x").unwrap();
    fs::write(dir.join(recent::FILE_NAME), "{}").unwrap();
    fs::write(
        dir.join("huge.svg"),
        format!("{SQUARE}<!--{}-->", "x".repeat(clean::MAX_SVG_BYTES)),
    )
    .unwrap();
    fs::create_dir(dir.join("folder.svg")).unwrap();
    let all = list(&dir);
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "planted");
    assert_eq!(all[0].name, "planted");
    assert!(!all[0].svg.contains("script") && !all[0].svg.contains("onload"));
}

#[cfg(unix)]
#[test]
fn links_are_not_followed() {
    let (t, dir) = lib();
    fs::create_dir_all(&dir).unwrap();
    let outside = t.path().join("outside.svg");
    fs::write(&outside, SQUARE).unwrap();
    std::os::unix::fs::symlink(&outside, dir.join("link.svg")).unwrap();
    assert!(list(&dir).is_empty());
}

#[test]
fn the_library_is_bounded() {
    let (_t, dir) = lib();
    fs::create_dir_all(&dir).unwrap();
    let canonical = save(&dir, "s", &[], SQUARE).unwrap().svg;
    for i in 1..MAX_SYMBOLS {
        fs::write(dir.join(format!("s{i}.svg")), &canonical).unwrap();
    }
    assert_eq!(list(&dir).len(), MAX_SYMBOLS);
    assert_eq!(
        save(&dir, "one more", &[], SQUARE).unwrap_err().code,
        FsErrorCode::TooLarge
    );
}

#[test]
fn import_and_export_a_folder() {
    let (t, dir) = lib();
    let src = t.path().join("in");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("Arrow Up.svg"), SQUARE).unwrap();
    fs::write(
        src.join("named.SVG"),
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" data-tags="a, b"><title>Titled</title><circle r="1"/></svg>"#,
    )
    .unwrap();
    fs::write(src.join("evil.svg"), EVIL).unwrap();
    fs::write(src.join("bad.svg"), "nope").unwrap();
    fs::write(src.join("readme.txt"), "x").unwrap();
    fs::create_dir(src.join("sub")).unwrap();
    fs::write(src.join("sub").join("deep.svg"), SQUARE).unwrap();
    let report = import_folder(&dir, &src).unwrap();
    assert_eq!(
        report,
        ImportReport {
            imported: 3,
            skipped: 1,
            full: false
        }
    );
    let all = list(&dir);
    let names: Vec<&str> = all.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, vec!["Arrow Up", "evil", "Titled"]);
    assert_eq!(all[2].tags, vec!["a", "b"]);
    assert_eq!(all[0].id, "arrow-up");

    let out = t.path().join("out");
    fs::create_dir(&out).unwrap();
    let (folder, n) = export_folder(&dir, &out).unwrap();
    assert_eq!(n, 3);
    assert_eq!(folder, out.join(EXPORT_FOLDER));
    let (second, _) = export_folder(&dir, &out).unwrap();
    assert_eq!(second, out.join(format!("{EXPORT_FOLDER} 2")));
    let mut files: Vec<String> = fs::read_dir(&folder)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    files.sort();
    assert_eq!(files, vec!["arrow-up.svg", "evil.svg", "titled.svg"]);
    // no temp folder left behind
    assert_eq!(fs::read_dir(&out).unwrap().count(), 2);
    // a round trip through another library keeps names and tags
    let (_t2, other) = lib();
    assert_eq!(import_folder(&other, &folder).unwrap().imported, 3);
    let again: Vec<(String, Vec<String>)> =
        list(&other).into_iter().map(|s| (s.name, s.tags)).collect();
    let before: Vec<(String, Vec<String>)> = all.into_iter().map(|s| (s.name, s.tags)).collect();
    assert_eq!(again, before);

    assert_eq!(
        export_folder(&dir, &src.join("readme.txt"))
            .unwrap_err()
            .code,
        FsErrorCode::NotADirectory
    );
    assert!(import_folder(&dir, &t.path().join("missing")).is_err());
}

#[test]
fn import_stops_when_the_library_is_full() {
    let (t, dir) = lib();
    fs::create_dir_all(&dir).unwrap();
    let canonical = save(&dir, "s", &[], SQUARE).unwrap().svg;
    for i in 1..MAX_SYMBOLS - 1 {
        fs::write(dir.join(format!("s{i}.svg")), &canonical).unwrap();
    }
    let src = t.path().join("in");
    fs::create_dir(&src).unwrap();
    for i in 0..3 {
        fs::write(src.join(format!("n{i}.svg")), SQUARE).unwrap();
    }
    let report = import_folder(&dir, &src).unwrap();
    assert_eq!((report.imported, report.full), (1, true));
}
