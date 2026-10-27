//! Test helpers: the fixtures under `testdata/fixtures/` (repo root) and tree comparison.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/fixtures")
}

pub fn camscanner() -> PathBuf {
    fixtures().join("camscanner.icon")
}

/// Every documented `icon.json` field + unknown ones (prompt 010).
pub fn all_fields() -> PathBuf {
    fixtures().join("all-fields.icon")
}

pub fn camscanner_json() -> Vec<u8> {
    fs::read(camscanner().join("icon.json")).unwrap()
}

/// Every file below `dir` as relative path (`/`) → bytes.
pub fn tree(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut out = BTreeMap::new();
    walk(dir, dir, &mut out);
    out
}

fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
    for e in fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            walk(root, &p, out);
        } else {
            let rel = p
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            out.insert(rel, fs::read(&p).unwrap());
        }
    }
}

/// Copies a folder tree (fixtures are read-only in the repo).
pub fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for (rel, bytes) in tree(from) {
        let target = to.join(&rel);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(target, bytes).unwrap();
    }
}

/// A ZIP from `(name, bytes)` entries, Deflate.
pub fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    use std::io::Write;
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    for (name, bytes) in entries {
        if name.ends_with('/') {
            w.add_directory(*name, opts).unwrap();
        } else {
            w.start_file(*name, opts).unwrap();
            w.write_all(bytes).unwrap();
        }
    }
    w.finish().unwrap().into_inner()
}

/// The camscanner bundle as ZIP entries below `root` (`""` or `X.icon/`).
pub fn camscanner_zip(root: &str) -> Vec<u8> {
    let files = tree(&camscanner());
    let owned: Vec<(String, Vec<u8>)> = files
        .into_iter()
        .map(|(k, v)| (format!("{root}{k}"), v))
        .collect();
    let entries: Vec<(&str, &[u8])> = owned
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_slice()))
        .collect();
    make_zip(&entries)
}
