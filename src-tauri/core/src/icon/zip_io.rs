//! Zipped `.icon` files: read with limits and checked entry names (design 002 E7, E8, E10),
//! written in memory and then atomically (`fs_atomic::write_atomic`, or the bundle swap when a
//! folder stands at the target).

use super::bundle::{check_writable, read_limited, sibling, split_entries, swap_into_place};
use super::{ExtraFile, IconFile, IconFormat, Limits, invalid, too_large};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use std::fs;
use std::io::{self, BufReader, Cursor, Write};
use std::path::Path;
use zip::result::ZipError;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

fn zip_error(e: ZipError, path: &Path) -> FsError {
    match e {
        ZipError::Io(e) => FsError::from_io(&e, path),
        ZipError::UnsupportedArchive(_)
        | ZipError::InvalidPassword
        | ZipError::CompressionMethodNotSupported(_) => {
            FsError::new(FsErrorCode::UnsupportedIcon, e.to_string(), Some(path))
        }
        other => invalid(other.to_string(), path),
    }
}

/// An entry name we accept: relative, no `.`/`..`, no backslash or NUL (002 E8).
fn is_safe_entry(name: &str) -> bool {
    let name = name.strip_suffix('/').unwrap_or(name);
    !name.is_empty()
        && !name.starts_with('/')
        && !name.contains('\\')
        && !name.contains('\0')
        && !(name.len() >= 2 && name.as_bytes()[1] == b':')
        && name
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}

/// The folder inside the archive that holds `icon.json` (002 E10).
fn find_root(entries: &[(String, Vec<u8>)]) -> Option<String> {
    if entries.iter().any(|(n, _)| n == "icon.json") {
        return Some(String::new());
    }
    let roots: Vec<&str> = entries
        .iter()
        .filter_map(|(n, _)| n.strip_suffix("/icon.json"))
        .filter(|r| !r.contains('/') && *r != "__MACOSX")
        .collect();
    match roots.as_slice() {
        [one] => Some(format!("{one}/")),
        _ => None,
    }
}

/// Entry count of the end-of-central-directory record (`None`: not found or ZIP64). The zip
/// crate keeps one entry per name, so the same name twice only shows as a smaller `len()`.
fn declared_entries(f: &mut fs::File) -> Option<u64> {
    use std::io::{Read, Seek, SeekFrom};
    let len = f.metadata().ok()?.len();
    let tail = len.min(22 + 65_535);
    f.seek(SeekFrom::Start(len - tail)).ok()?;
    let mut buf = Vec::with_capacity(tail as usize);
    Read::by_ref(f).take(tail).read_to_end(&mut buf).ok()?;
    f.seek(SeekFrom::Start(0)).ok()?;
    let at = (0..=buf.len().checked_sub(22)?)
        .rev()
        .find(|&i| buf[i..i + 4] == *b"PK\x05\x06")?;
    let n = u16::from_le_bytes([buf[at + 10], buf[at + 11]]);
    (n != 0xFFFF).then_some(u64::from(n))
}

/// Reads a zipped `.icon`.
pub fn read_zip(path: &Path, limits: &Limits) -> Result<IconFile, FsError> {
    let mut f = fs::File::open(path).map_err(|e| FsError::from_io(&e, path))?;
    // the central directory is read in full by `ZipArchive::new`: look at the size first (031)
    let len = f.metadata().map_err(|e| FsError::from_io(&e, path))?.len();
    if len > limits.max_total {
        return Err(too_large("ZIP too large", path));
    }
    let declared = declared_entries(&mut f);
    let mut archive = ZipArchive::new(BufReader::new(f)).map_err(|e| zip_error(e, path))?;
    // the same name twice: which one counts depends on the reader – refuse (prompt 031)
    if declared.is_some_and(|n| n != archive.len() as u64) {
        return Err(invalid("duplicate entries in the ZIP", path));
    }
    if archive.len() > limits.max_entries {
        return Err(too_large("too many entries in the ZIP", path));
    }
    let mut entries = Vec::new();
    let mut names = std::collections::HashSet::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        let raw = archive.by_index_raw(i).map_err(|e| zip_error(e, path))?;
        let name = raw.name().to_owned();
        if !is_safe_entry(&name) || raw.enclosed_name().is_none() {
            return Err(invalid(format!("unsafe entry name {name:?}"), path));
        }
        if !names.insert(name.clone()) {
            return Err(invalid(format!("duplicate entry {name:?}"), path));
        }
        if raw.encrypted() {
            return Err(FsError::new(
                FsErrorCode::UnsupportedIcon,
                "encrypted ZIP",
                Some(path),
            ));
        }
        if raw.is_dir() {
            continue;
        }
        if raw.size() > limits.max_file {
            return Err(too_large(format!("{name} too large"), path));
        }
        drop(raw);
        let entry = archive.by_index(i).map_err(|e| zip_error(e, path))?;
        let bytes = read_limited(entry, limits.max_file)
            .map_err(|e| invalid(format!("{name}: {e}"), path))?
            .ok_or_else(|| too_large(format!("{name} too large"), path))?;
        total += bytes.len() as u64;
        if total > limits.max_total {
            return Err(too_large("ZIP too large", path));
        }
        entries.push((name, bytes));
    }
    let root = find_root(&entries).ok_or_else(|| invalid("no icon.json in the ZIP", path))?;
    let (inside, outside): (Vec<_>, Vec<_>) =
        entries.into_iter().partition(|(n, _)| n.starts_with(&root));
    let inside = inside
        .into_iter()
        .map(|(n, b)| (n[root.len()..].to_owned(), b))
        .collect();
    let mut warnings = Vec::new();
    let (json, assets, extra) = split_entries(inside, &mut warnings);
    let json = json.ok_or_else(|| invalid("no icon.json in the ZIP", path))?;
    let mut file = IconFile::from_parts(IconFormat::Zip, json, assets, extra, warnings, path)?;
    file.zip_root = root;
    file.outside_root = outside
        .into_iter()
        .map(|(path, bytes)| ExtraFile { path, bytes })
        .collect();
    Ok(file)
}

/// The archive bytes: `icon.json`, assets, extra files, then the entries outside the root.
pub fn build_zip(file: &IconFile) -> io::Result<Vec<u8>> {
    let mut w = ZipWriter::new(Cursor::new(Vec::new()));
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let root = &file.zip_root;
    let mut put = |name: String, bytes: &[u8]| -> io::Result<()> {
        w.start_file(name, opts).map_err(io::Error::other)?;
        w.write_all(bytes)
    };
    put(format!("{root}icon.json"), &file.json_bytes)?;
    for a in &file.assets {
        put(format!("{root}Assets/{}", a.name), &a.bytes)?;
    }
    for e in &file.extra_files {
        put(format!("{root}{}", e.path), &e.bytes)?;
    }
    for e in &file.outside_root {
        put(e.path.clone(), &e.bytes)?;
    }
    Ok(w.finish().map_err(io::Error::other)?.into_inner())
}

/// Writes `file` as ZIP at `target`.
pub fn write_zip(target: &Path, file: &IconFile) -> Result<(), FsError> {
    check_writable(file, target)?;
    for e in &file.outside_root {
        if !is_safe_entry(&e.path) {
            return Err(invalid(format!("unsafe path {:?}", e.path), target));
        }
    }
    let io_err = |e: io::Error| FsError::from_io(&e, target);
    let bytes = build_zip(file).map_err(io_err)?;
    let is_dir = fs::symlink_metadata(target).is_ok_and(|m| m.is_dir());
    if !is_dir {
        return write_atomic(target, &bytes).map_err(io_err);
    }
    // a bundle folder stands at the target ("Save As" ZIP over it): write next to it, then swap
    let tmp = sibling(target, "tmp").map_err(io_err)?;
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
        drop(f);
        swap_into_place(&tmp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(io_err)
}

#[cfg(test)]
#[path = "zip_io_tests.rs"]
mod tests;
