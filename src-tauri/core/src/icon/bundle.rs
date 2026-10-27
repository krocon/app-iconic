//! Folder bundles (`X.icon/icon.json`, `X.icon/Assets/*`): read with limits, write by building
//! a new bundle next to the old one and swapping (design 002 E6 – a folder cannot be renamed over
//! an existing one, neither on Windows nor over a non-empty folder on Unix).

use super::names::{is_valid_asset_name, name_key};
use super::{
    ExtraFile, IconAsset, IconFile, IconFormat, IconWarning, IconWarningCode, Limits, invalid,
    too_large,
};
use crate::error::{FsError, FsErrorCode};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Sorts `(relative path, bytes)` entries into `icon.json`, assets and extra files (002 E9).
/// Entries that a case-insensitive file system (macOS, Windows) cannot keep apart from an earlier
/// one – `a.svg` next to `A.svg`, a file `ASSETS` or `Icon.json` – are left out with a warning:
/// saving would make one overwrite the other (prompt 031).
pub(crate) fn split_entries(
    entries: Vec<(String, Vec<u8>)>,
    warnings: &mut Vec<IconWarning>,
) -> (Option<Vec<u8>>, Vec<IconAsset>, Vec<ExtraFile>) {
    let mut json = None;
    let mut assets = Vec::new();
    let mut extra = Vec::new();
    let mut keys = PathKeys::default();
    keys.add("icon.json");
    keys.add("Assets/");
    let ignore = |path: String, warnings: &mut Vec<IconWarning>| {
        warnings.push(IconWarning {
            code: IconWarningCode::IgnoredEntry,
            name: path,
        })
    };
    // icon.json and assets first: they win over extra files
    let (main, rest): (Vec<_>, Vec<_>) = entries.into_iter().partition(|(p, _)| {
        p == "icon.json"
            || p.strip_prefix("Assets/")
                .is_some_and(|n| !n.contains('/') && is_valid_asset_name(n))
    });
    for (path, bytes) in main {
        if path == "icon.json" {
            json = Some(bytes);
        } else if keys.add(&path) {
            assets.push(IconAsset::new(&path["Assets/".len()..], bytes));
        } else {
            ignore(path, warnings);
        }
    }
    for (path, bytes) in rest {
        if keys.add(&path) {
            extra.push(ExtraFile { path, bytes });
        } else {
            ignore(path, warnings);
        }
    }
    (json, assets, extra)
}

/// File and folder paths as a case-insensitive file system sees them (`name_key` per path).
#[derive(Default)]
struct PathKeys {
    files: std::collections::HashSet<String>,
    folders: std::collections::HashSet<String>,
}

impl PathKeys {
    /// Adds a file (`a/b`) or a folder (`a/`); `false` if it clashes with what is there: the same
    /// key, a file where a folder is, or a folder on its way that is a file.
    fn add(&mut self, path: &str) -> bool {
        let folder = path.ends_with('/');
        let key = name_key(path.trim_end_matches('/'));
        let parents: Vec<&str> = key.match_indices('/').map(|(i, _)| &key[..i]).collect();
        if self.files.contains(&key)
            || (!folder && self.folders.contains(&key))
            || parents.iter().any(|p| self.files.contains(*p))
        {
            return false;
        }
        for p in parents {
            self.folders.insert(p.to_owned());
        }
        if folder {
            self.folders.insert(key);
        } else {
            self.files.insert(key);
        }
        true
    }
}

/// Reads a file with a hard size limit (the metadata may lie or change meanwhile).
pub(crate) fn read_limited(mut r: impl Read, limit: u64) -> io::Result<Option<Vec<u8>>> {
    let mut buf = Vec::new();
    r.by_ref().take(limit + 1).read_to_end(&mut buf)?;
    Ok((buf.len() as u64 <= limit).then_some(buf))
}

struct Walk<'a> {
    root: &'a Path,
    limits: &'a Limits,
    entries: usize,
    total: u64,
    files: Vec<(String, Vec<u8>)>,
    warnings: Vec<IconWarning>,
}

impl Walk<'_> {
    fn dir(&mut self, dir: &Path, depth: usize) -> Result<(), FsError> {
        if depth > self.limits.max_depth {
            return Err(too_large("bundle nested too deeply", dir));
        }
        let mut children: Vec<PathBuf> = fs::read_dir(dir)
            .map_err(|e| FsError::from_io(&e, dir))?
            .map(|e| e.map(|e| e.path()))
            .collect::<Result<_, _>>()
            .map_err(|e| FsError::from_io(&e, dir))?;
        children.sort();
        for p in children {
            self.entries += 1;
            if self.entries > self.limits.max_entries {
                return Err(too_large("too many files in the bundle", self.root));
            }
            let rel = relative(self.root, &p)?;
            let meta = fs::symlink_metadata(&p).map_err(|e| FsError::from_io(&e, &p))?;
            if meta.file_type().is_symlink() {
                self.warnings.push(IconWarning {
                    code: IconWarningCode::IgnoredEntry,
                    name: rel,
                });
            } else if meta.is_dir() {
                self.dir(&p, depth + 1)?;
            } else if meta.is_file() {
                if meta.len() > self.limits.max_file {
                    return Err(too_large("file too large", &p));
                }
                let f = fs::File::open(&p).map_err(|e| FsError::from_io(&e, &p))?;
                let bytes = read_limited(f, self.limits.max_file)
                    .map_err(|e| FsError::from_io(&e, &p))?
                    .ok_or_else(|| too_large("file too large", &p))?;
                self.total += bytes.len() as u64;
                if self.total > self.limits.max_total {
                    return Err(too_large("bundle too large", self.root));
                }
                self.files.push((rel, bytes));
            } else {
                self.warnings.push(IconWarning {
                    code: IconWarningCode::IgnoredEntry,
                    name: rel,
                });
            }
        }
        Ok(())
    }
}

fn relative(root: &Path, p: &Path) -> Result<String, FsError> {
    let rel = p
        .strip_prefix(root)
        .map_err(|_| invalid("outside the bundle", p))?;
    let parts: Option<Vec<&str>> = rel.components().map(|c| c.as_os_str().to_str()).collect();
    parts
        .map(|p| p.join("/"))
        .ok_or_else(|| invalid("file name is not valid Unicode", p))
}

/// Reads a bundle folder.
pub fn read_bundle(dir: &Path, limits: &Limits) -> Result<IconFile, FsError> {
    let mut walk = Walk {
        root: dir,
        limits,
        entries: 0,
        total: 0,
        files: Vec::new(),
        warnings: Vec::new(),
    };
    walk.dir(dir, 0)?;
    let mut warnings = walk.warnings;
    let (json, assets, extra) = split_entries(walk.files, &mut warnings);
    let json = json.ok_or_else(|| invalid("no icon.json in the bundle", dir))?;
    IconFile::from_parts(IconFormat::Bundle, json, assets, extra, warnings, dir)
}

/// Is `path` a relative path that stays inside the bundle?
pub(crate) fn is_safe_relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && !path.contains('\0')
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

/// Checks names before anything is written.
pub(crate) fn check_writable(file: &IconFile, target: &Path) -> Result<(), FsError> {
    let mut seen = std::collections::HashSet::new();
    for a in &file.assets {
        // two names one file system cannot tell apart would overwrite each other (002 E12)
        if !is_valid_asset_name(&a.name) || !seen.insert(super::names::name_key(&a.name)) {
            return Err(FsError::new(
                FsErrorCode::InvalidPath,
                format!("invalid asset name {:?}", a.name),
                Some(target),
            ));
        }
    }
    for e in &file.extra_files {
        if !is_safe_relative(&e.path) {
            return Err(invalid(format!("unsafe path {:?}", e.path), target));
        }
    }
    Ok(())
}

fn write_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut f = fs::File::create(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

static SEQ: AtomicU64 = AtomicU64::new(0);

/// `.<name>.<tag>-<pid>-<n>` next to `target`.
pub(crate) fn sibling(target: &Path, tag: &str) -> io::Result<PathBuf> {
    let name = target
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    let mut s = std::ffi::OsString::from(".");
    s.push(name);
    s.push(format!(".{tag}-{}-{n}", std::process::id()));
    Ok(target.with_file_name(s))
}

fn remove_any(path: &Path) -> io::Result<()> {
    if fs::symlink_metadata(path)?.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

/// Moves the finished `tmp` (file or folder) to `target`, replacing whatever is there (002 E6):
/// old → `.<name>.old-…`, tmp → target, delete old. If the second rename fails, the old one is
/// renamed back.
pub(crate) fn swap_into_place(tmp: &Path, target: &Path) -> io::Result<()> {
    match fs::symlink_metadata(target) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => fs::rename(tmp, target),
        Err(e) => Err(e),
        Ok(_) => {
            let old = sibling(target, "old")?;
            fs::rename(target, &old)?;
            if let Err(e) = fs::rename(tmp, target) {
                let _ = fs::rename(&old, target);
                return Err(e);
            }
            let _ = remove_any(&old);
            Ok(())
        }
    }
}

/// Writes `file` as a bundle folder at `target`.
pub fn write_bundle(target: &Path, file: &IconFile) -> Result<(), FsError> {
    write_bundle_with(target, file, || Ok(()))
}

/// [`write_bundle`] with a hook right before the swap (tests break the save there).
pub(crate) fn write_bundle_with(
    target: &Path,
    file: &IconFile,
    before_swap: impl FnOnce() -> io::Result<()>,
) -> Result<(), FsError> {
    check_writable(file, target)?;
    let io_err = |e: io::Error| FsError::from_io(&e, target);
    if let Some(dir) = target.parent().filter(|d| !d.as_os_str().is_empty()) {
        fs::create_dir_all(dir).map_err(io_err)?;
    }
    let tmp = sibling(target, "tmp").map_err(io_err)?;
    let built = (|| {
        fs::create_dir(&tmp)?;
        write_file(&tmp.join("icon.json"), &file.json_bytes)?;
        fs::create_dir(tmp.join("Assets"))?;
        for a in &file.assets {
            write_file(&tmp.join("Assets").join(&a.name), &a.bytes)?;
        }
        for e in &file.extra_files {
            write_file(&tmp.join(&e.path), &e.bytes)?;
        }
        before_swap()?;
        swap_into_place(&tmp, target)
    })();
    if let Err(e) = built {
        let _ = fs::remove_dir_all(&tmp);
        return Err(io_err(e));
    }
    Ok(())
}

#[cfg(test)]
#[path = "bundle_tests.rs"]
mod tests;
