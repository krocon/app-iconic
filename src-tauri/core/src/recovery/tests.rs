use super::*;
use crate::icon::save::{AssetInput, assemble};
use crate::icon::testdata::{all_fields, camscanner, tree};
use crate::icon::{new_icon, read_icon};
use tempfile::tempdir;

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<_> = fs::read_dir(dir)
        .map(|r| {
            r.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

fn meta(me: &Instance, path: Option<&str>) -> Meta {
    Meta::new(
        me.next_id(),
        path.map(str::to_owned),
        IconFormat::Bundle,
        "doc-1".into(),
    )
}

/// A dead instance: a lock file nobody holds (what a killed process leaves behind).
fn dead_instance(dir: &Path, id: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(format!("{id}.lock")), b"4242").unwrap();
}

const DEAD: &str = "00000000000000aa";

#[test]
fn ids_are_checked() {
    assert!(is_valid_id("0123456789abcdef-1"));
    assert!(is_valid_id("0123456789abcdef-4294967295"));
    for bad in [
        "",
        "0123456789abcdef",
        "0123456789abcdef-",
        "0123456789ABCDEF-1",
        "0123456789abcde-1",
        "0123456789abcdef-1a",
        "../0123456789abcd-1",
        "0123456789abcdef-12345678901",
    ] {
        assert!(!is_valid_id(bad), "{bad}");
    }
    assert_eq!(instance_of("0123456789abcdef-3"), Some("0123456789abcdef"));
    assert_eq!(
        entry_instance(".0123456789abcdef-3.tmp-1-2"),
        Some("0123456789abcdef")
    );
    assert_eq!(
        entry_instance(".0123456789abcdef-3.old-1-2"),
        Some("0123456789abcdef")
    );
    assert_eq!(entry_instance(".0123456789abcdef-3.other"), None);
    assert_eq!(entry_instance("notes.txt"), None);
}

#[test]
fn write_and_read_round_trip_of_the_fixtures() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    for (src, format) in [
        (camscanner(), IconFormat::Zip),
        (all_fields(), IconFormat::Bundle),
    ] {
        let file = read_icon(&src, &Limits::default()).unwrap();
        let mut m = meta(&me, Some("/Users/ü/a b.icon"));
        m.format = format;
        write(&rec, &m, file.clone()).unwrap();
        let back = read_meta(&rec, &m.id).unwrap();
        assert_eq!(back, m);
        let (m2, f2) = read(&rec, &m.id).unwrap();
        assert_eq!(m2, m);
        assert_eq!(f2.format, format, "the document keeps its own format");
        assert_eq!(f2.json, file.json);
        assert_eq!(f2.json_bytes, file.json_bytes);
        assert_eq!(f2.assets, file.assets);
        assert_eq!(f2.extra_files, file.extra_files);
        // the snapshot is a plain bundle, byte for byte the fixture
        assert_eq!(tree(&rec.join(&m.id).join(ICON_DIR)), tree(&src));
    }
}

#[test]
fn a_snapshot_is_written_like_saving_png_assets_included() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    let png = crate::thumbnails::render(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>"##,
        crate::fonts::system::system_fonts(),
    )
    .unwrap();
    use base64::Engine;
    let url = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    );
    let base = new_icon();
    let file = assemble(
        Some(&base),
        IconFormat::Zip,
        base.json.clone(),
        vec![
            AssetInput {
                name: "layer.svg".into(),
                text: None,
                data_url: None,
                unchanged: true,
                source: None,
            },
            AssetInput {
                name: "photo.png".into(),
                text: None,
                data_url: Some(url),
                unchanged: false,
                source: None,
            },
        ],
        &rec,
    )
    .unwrap();
    let m = meta(&me, None);
    write(&rec, &m, file).unwrap();
    let (_, back) = read(&rec, &m.id).unwrap();
    assert_eq!(back.asset("photo.png").unwrap().bytes, png);
    assert_eq!(back.asset("layer.svg").unwrap().bytes, base.assets[0].bytes);
}

#[test]
fn a_write_that_stops_half_way_leaves_nothing_listed() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    let file = read_icon(&camscanner(), &Limits::default()).unwrap();
    let m = meta(&me, Some("/a.icon"));
    let err = write_with(&rec, &m, file.clone(), || Err(io::Error::other("crash"))).unwrap_err();
    assert_eq!(err.code, FsErrorCode::Io);
    assert_eq!(
        names(&rec),
        [format!("{}.lock", me.id())],
        "temp folder removed"
    );
    assert!(read_meta(&rec, &m.id).is_none());

    // a good snapshot, then a broken rewrite: the good one stays as it was
    write(&rec, &m, file.clone()).unwrap();
    let before = tree(&rec.join(&m.id));
    let mut empty = file.clone();
    empty.assets.clear();
    let _ = write_with(&rec, &m, empty, || Err(io::Error::other("crash")));
    assert_eq!(tree(&rec.join(&m.id)), before);

    // a process killed mid-write: hidden leftover, a folder without meta – neither is listed
    let dead_id = format!("{DEAD}-1");
    dead_instance(&rec, DEAD);
    fs::create_dir_all(rec.join(format!(".{dead_id}.tmp-1-1")).join(ICON_DIR)).unwrap();
    fs::create_dir_all(rec.join(format!("{DEAD}-2")).join(ICON_DIR)).unwrap();
    assert!(list(&rec, Some(me.id())).is_empty());
    // … and prune removes them with the dead lock file; ours stays
    assert_eq!(prune(&rec, Some(me.id())), 3);
    let mut want = vec![format!("{}.lock", me.id()), m.id.clone()];
    want.sort();
    assert_eq!(names(&rec), want);
}

#[test]
fn only_snapshots_of_instances_that_are_gone_are_offered() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    let other = Instance::acquire(&rec).unwrap(); // a second app process, running
    assert_ne!(me.id(), other.id());
    assert!(alive(&rec, other.id(), Some(me.id())));
    assert!(alive(&rec, me.id(), Some(me.id())));
    assert!(!alive(&rec, DEAD, Some(me.id())), "no lock file");
    dead_instance(&rec, DEAD);
    assert!(!alive(&rec, DEAD, Some(me.id())), "a lock nobody holds");

    let f = new_icon();
    write(&rec, &meta(&me, None), f.clone()).unwrap();
    write(&rec, &meta(&other, Some("/o.icon")), f.clone()).unwrap();
    let mut old = Meta::new(
        format!("{DEAD}-1"),
        Some("/old.icon".into()),
        IconFormat::Zip,
        "doc-2".into(),
    );
    old.saved_at = 1;
    write(&rec, &old, f.clone()).unwrap();
    let mut newer = Meta::new(
        format!("{DEAD}-2"),
        None,
        IconFormat::Bundle,
        "doc-3".into(),
    );
    newer.saved_at = 2;
    write(&rec, &newer, f.clone()).unwrap();

    let listed: Vec<_> = list(&rec, Some(me.id()))
        .into_iter()
        .map(|m| m.id)
        .collect();
    assert_eq!(
        listed,
        [newer.id.clone(), old.id.clone()],
        "newest first, no live ones"
    );
    // the other running process sees the dead ones too, never ours
    let theirs: Vec<_> = list(&rec, Some(other.id()))
        .into_iter()
        .map(|m| m.id)
        .collect();
    assert_eq!(theirs, listed);
    // prune keeps complete snapshots of the dead and everything of the living
    assert_eq!(prune(&rec, Some(me.id())), 1, "only the dead lock file");
    assert_eq!(list(&rec, Some(me.id())).len(), 2);

    // the other process quits regularly: its snapshot and lock go
    let other_id = other.id().to_owned();
    assert_eq!(other.release(), 1);
    assert!(!names(&rec).iter().any(|n| n.starts_with(&other_id)));
}

#[test]
fn adopt_moves_a_dead_snapshot_to_this_instance_once() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    let other = Instance::acquire(&rec).unwrap();
    let file = read_icon(&camscanner(), &Limits::default()).unwrap();
    let dead = Meta::new(
        format!("{DEAD}-7"),
        Some("/x/a.icon".into()),
        IconFormat::Zip,
        "doc-4".into(),
    );
    write(&rec, &dead, file.clone()).unwrap();
    let live = meta(&other, None);
    write(&rec, &live, file.clone()).unwrap();

    assert_eq!(
        adopt(&me, &live.id).unwrap_err().code,
        FsErrorCode::RecoveryUnavailable
    );
    assert_eq!(
        adopt(&me, "../x").unwrap_err().code,
        FsErrorCode::InvalidRequest
    );

    let (m, f) = adopt(&me, &dead.id).unwrap();
    assert!(me.owns(&m.id));
    assert_eq!(m.path.as_deref(), Some("/x/a.icon"));
    assert_eq!(f.format, IconFormat::Zip);
    assert_eq!(f.assets, file.assets);
    assert!(!rec.join(&dead.id).exists());
    assert_eq!(read_meta(&rec, &m.id).unwrap().id, m.id);
    // a second window (or process) cannot take it again; it is not offered any more
    assert_eq!(
        adopt(&other, &dead.id).unwrap_err().code,
        FsErrorCode::RecoveryUnavailable
    );
    assert!(list(&rec, Some(other.id())).is_empty());

    assert!(discard(&rec, &m.id).unwrap());
    assert!(!discard(&rec, &m.id).unwrap());
    assert_eq!(
        discard(&rec, "..").unwrap_err().code,
        FsErrorCode::InvalidRequest
    );
}

#[test]
fn too_large_documents_are_refused() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    let mut f = new_icon();
    f.extra_files.push(crate::icon::ExtraFile {
        path: "big.bin".into(),
        bytes: vec![0; MAX_BYTES as usize + 1],
    });
    let m = meta(&me, None);
    assert_eq!(write(&rec, &m, f).unwrap_err().code, FsErrorCode::TooLarge);
    assert_eq!(names(&rec), [format!("{}.lock", me.id())]);
}

#[test]
fn foreign_files_and_broken_meta_are_left_alone_or_ignored() {
    let dir = tempdir().unwrap();
    let rec = dir.path().join(DIR_NAME);
    let me = Instance::acquire(&rec).unwrap();
    fs::write(rec.join("README.txt"), b"keep").unwrap();
    fs::create_dir_all(rec.join("folder")).unwrap();
    dead_instance(&rec, DEAD);
    let m = Meta::new(format!("{DEAD}-1"), None, IconFormat::Bundle, "w".into());
    write(&rec, &m, new_icon()).unwrap();
    // meta of another id in this folder (copied by hand) is not trusted
    let mut wrong = m.clone();
    wrong.id = format!("{DEAD}-9");
    fs::write(
        rec.join(&m.id).join(META_FILE),
        serde_json::to_vec(&wrong).unwrap(),
    )
    .unwrap();
    assert!(list(&rec, Some(me.id())).is_empty());
    prune(&rec, Some(me.id()));
    let mut want = vec![
        "README.txt".to_owned(),
        "folder".into(),
        format!("{}.lock", me.id()),
    ];
    want.sort();
    assert_eq!(
        names(&rec),
        want,
        "the dead folder with a wrong meta went, foreign files stay"
    );
}
