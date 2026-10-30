//! The own symbol library (prompt 084, design E5–E9): one cleaned SVG per symbol in
//! `<app config>/symbols/<id>.svg` – name in `<title>`, tags in `data-tags` – plus the recently
//! used symbols of every set ([`recent`]). Every file goes through [`clean`] on saving **and** on
//! loading; files that do not pass are skipped (and left alone). The WebView only sees ids and the
//! cleaned markup, never a path of this folder (pattern `thumbnails`, prompt 082). Writes are
//! atomic; a folder export is written next to its target and renamed into place.

pub mod clean;
pub mod recent;

use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use clean::Parsed;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Folder in the app config directory.
pub const DIR_NAME: &str = "symbols";
/// Most symbols in the library.
pub const MAX_SYMBOLS: usize = 500;
/// Most files of a folder looked at by an import.
pub const MAX_IMPORT_FILES: usize = 2_000;
/// Longest id (file stem).
pub const MAX_ID_CHARS: usize = 48;
/// The name of the folder an export creates inside the chosen one.
pub const EXPORT_FOLDER: &str = "AppIconic Symbols";

/// One symbol of the library, cleaned.
#[derive(Debug, Clone, PartialEq)]
pub struct LibrarySymbol {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    /// The canonical, cleaned SVG.
    pub svg: String,
}

/// What an import did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImportReport {
    pub imported: usize,
    /// SVG files that were no usable symbol (or beyond the limits).
    pub skipped: usize,
    /// The library is full: the rest was not imported.
    pub full: bool,
}

/// An id: `[a-z0-9]` then `[a-z0-9-]`, at most [`MAX_ID_CHARS`] – a file stem on every system,
/// never a path.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_CHARS
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-')
}

fn checked_id(id: &str) -> Result<(), FsError> {
    if valid_id(id) {
        Ok(())
    } else {
        Err(FsError::new(
            FsErrorCode::InvalidRequest,
            "not a symbol id",
            None,
        ))
    }
}

fn file_of(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.svg"))
}

/// The id a file name stands for (`star.svg` → `star`), if it is one of ours.
fn id_of(name: &str) -> Option<&str> {
    name.strip_suffix(".svg").filter(|s| valid_id(s))
}

/// A regular file (no link, no folder) of at most [`clean::MAX_SVG_BYTES`] as text.
fn read_limited(path: &Path) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > clean::MAX_SVG_BYTES as u64 {
        return None;
    }
    let mut text = String::new();
    fs::File::open(path)
        .ok()?
        .take(clean::MAX_SVG_BYTES as u64 + 1)
        .read_to_string(&mut text)
        .ok()?;
    Some(text)
}

/// A slug of `name` for a new id: ASCII letters and digits, `-` between words, else `symbol`.
fn slug(name: &str) -> String {
    let mut s = String::new();
    for c in name.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !s.is_empty() && !s.ends_with('-') {
            s.push('-');
        }
    }
    let s: String = s.chars().take(MAX_ID_CHARS - 4).collect();
    let s = s.trim_end_matches('-');
    if s.is_empty() {
        "symbol".into()
    } else {
        s.into()
    }
}

/// A free id for `name` (`star`, `star-2`, …).
fn new_id(dir: &Path, name: &str) -> String {
    let base = slug(name);
    if !file_of(dir, &base).exists() {
        return base;
    }
    (2..)
        .map(|n| format!("{base}-{n}"))
        .find(|id| !file_of(dir, id).exists())
        .expect("a free id")
}

/// The ids of the library files (sorted), at most [`MAX_SYMBOLS`] – more files are ignored.
fn ids(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter_map(|e| id_of(&e.file_name().to_string_lossy()).map(str::to_owned))
        .collect();
    ids.sort();
    ids.truncate(MAX_SYMBOLS);
    ids
}

/// Loads (and cleans) symbol `id`; `None` if it is missing or not a usable symbol.
fn load(dir: &Path, id: &str) -> Option<LibrarySymbol> {
    let text = read_limited(&file_of(dir, id))?;
    let p = clean::parse(&text).ok()?;
    let name = p.title.clone().unwrap_or_else(|| id.to_owned());
    let tags = p.tags.clone();
    Some(LibrarySymbol {
        id: id.to_owned(),
        svg: clean::write(&p, &name, &tags),
        name,
        tags,
    })
}

/// Every usable symbol, by name (then id). Files that do not pass the cleaner are skipped.
pub fn list(dir: &Path) -> Vec<LibrarySymbol> {
    let mut all: Vec<LibrarySymbol> = ids(dir).iter().filter_map(|id| load(dir, id)).collect();
    all.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });
    all
}

fn store(
    dir: &Path,
    id: &str,
    p: &Parsed,
    name: &str,
    tags: &[String],
) -> Result<LibrarySymbol, FsError> {
    let svg = clean::write(p, name, tags);
    let file = file_of(dir, id);
    write_atomic(&file, svg.as_bytes()).map_err(|e| FsError::from_io(&e, &file))?;
    Ok(LibrarySymbol {
        id: id.to_owned(),
        name: name.to_owned(),
        tags: tags.to_vec(),
        svg,
    })
}

fn name_or_error(name: &str) -> Result<String, FsError> {
    clean::clean_name(name)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidRequest, "a symbol needs a name", None))
}

fn full() -> FsError {
    FsError::new(
        FsErrorCode::TooLarge,
        format!("the library holds at most {MAX_SYMBOLS} symbols"),
        None,
    )
}

/// Saves `svg` (cleaned) as a new symbol `name` with `tags`.
pub fn save(dir: &Path, name: &str, tags: &[String], svg: &str) -> Result<LibrarySymbol, FsError> {
    let name = name_or_error(name)?;
    let tags = clean::clean_tags(tags.iter().map(String::as_str));
    let p = clean::parse(svg)?;
    if ids(dir).len() >= MAX_SYMBOLS {
        return Err(full());
    }
    store(dir, &new_id(dir, &name), &p, &name, &tags)
}

/// Renames symbol `id` and sets its tags (the id stays).
pub fn update(dir: &Path, id: &str, name: &str, tags: &[String]) -> Result<LibrarySymbol, FsError> {
    checked_id(id)?;
    let name = name_or_error(name)?;
    let tags = clean::clean_tags(tags.iter().map(String::as_str));
    let file = file_of(dir, id);
    let text = read_limited(&file)
        .ok_or_else(|| FsError::new(FsErrorCode::NotFound, "no such symbol", None))?;
    let p = clean::parse(&text)?;
    store(dir, id, &p, &name, &tags)
}

/// Removes symbol `id`; `false` if there was none.
pub fn delete(dir: &Path, id: &str) -> Result<bool, FsError> {
    checked_id(id)?;
    let file = file_of(dir, id);
    match fs::remove_file(&file) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(FsError::from_io(&e, &file)),
    }
}

/// Imports the `*.svg` files directly inside `src` (no sub-folders, no links): each one cleaned,
/// named after its `<title>` or file name, under a new id. Stops when the library is full.
pub fn import_folder(dir: &Path, src: &Path) -> Result<ImportReport, FsError> {
    let entries = fs::read_dir(src).map_err(|e| FsError::from_io(&e, src))?;
    let mut files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stem = name
                .strip_suffix(".svg")
                .or_else(|| name.strip_suffix(".SVG"))?
                .to_owned();
            (!stem.starts_with('.')).then(|| (stem, e.path()))
        })
        .collect();
    files.sort();
    let mut report = ImportReport {
        imported: 0,
        skipped: 0,
        full: false,
    };
    let mut count = ids(dir).len();
    for (i, (stem, path)) in files.iter().enumerate() {
        if i >= MAX_IMPORT_FILES {
            report.skipped += files.len() - i;
            break;
        }
        if count >= MAX_SYMBOLS {
            report.full = true;
            break;
        }
        let parsed = read_limited(path).and_then(|t| clean::parse(&t).ok());
        let Some(p) = parsed else {
            report.skipped += 1;
            continue;
        };
        let name = p
            .title
            .clone()
            .or_else(|| clean::clean_name(stem))
            .unwrap_or_else(|| "Symbol".into());
        let tags = p.tags.clone();
        store(dir, &new_id(dir, &name), &p, &name, &tags)?;
        report.imported += 1;
        count += 1;
    }
    Ok(report)
}

/// Writes every symbol as `<id>.svg` into a new folder [`EXPORT_FOLDER`] (`… 2`, … when taken)
/// inside `target`: first into a hidden temp folder there, then renamed – nothing of the user's
/// is overwritten. Returns the new folder and the number of symbols.
pub fn export_folder(dir: &Path, target: &Path) -> Result<(PathBuf, usize), FsError> {
    if !target.is_dir() {
        return Err(FsError::new(
            FsErrorCode::NotADirectory,
            "export target is no folder",
            Some(target),
        ));
    }
    let symbols = list(dir);
    let tmp = target.join(format!(".{EXPORT_FOLDER}.tmp-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir(&tmp).map_err(|e| FsError::from_io(&e, target))?;
    let written = (|| {
        for s in &symbols {
            let f = file_of(&tmp, &s.id);
            fs::write(&f, s.svg.as_bytes()).map_err(|e| FsError::from_io(&e, &f))?;
        }
        for n in 1.. {
            let name = if n == 1 {
                EXPORT_FOLDER.to_owned()
            } else {
                format!("{EXPORT_FOLDER} {n}")
            };
            let folder = target.join(name);
            if folder.exists() {
                continue;
            }
            fs::rename(&tmp, &folder).map_err(|e| FsError::from_io(&e, &folder))?;
            return Ok(folder);
        }
        unreachable!()
    })();
    match written {
        Ok(folder) => Ok((folder, symbols.len())),
        Err(e) => {
            let _ = fs::remove_dir_all(&tmp);
            Err(e)
        }
    }
}

#[cfg(test)]
#[path = "library_tests.rs"]
mod tests;
