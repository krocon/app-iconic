//! Export files (design 012 E10–E13): names `<name>-<appearance>.svg` and
//! `<name>-<appearance>-<size>.png` in one target folder, checked before anything is written,
//! never replaced without `overwrite`, each written atomically. PNG reports progress per file and
//! stops between files when `cancel` is set.

use super::png::{encode, has_transparency, parse, render};
use super::{
    APPEARANCES, ExportOptions, ExportProgress, ExportReport, ExportedFile, PNG_SIZES, Variant,
};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use resvg::usvg::fontdb::Database;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

const MAX_BASE_NAME: usize = 120;

fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidPath, message, None)
}

/// A file name stem from a document name: path separators, characters Windows forbids and
/// control characters become `_`, leading/trailing dots and spaces go, at most 120 characters.
pub fn file_base_name(name: &str) -> Result<String, FsError> {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .take(MAX_BASE_NAME)
        .collect();
    let trimmed = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        return Err(invalid("empty file name"));
    }
    Ok(trimmed.to_string())
}

fn check_variants(variants: &[Variant]) -> Result<(), FsError> {
    if variants.is_empty() || variants.len() > APPEARANCES.len() {
        return Err(invalid("one to three appearances"));
    }
    for (i, v) in variants.iter().enumerate() {
        if !APPEARANCES.contains(&v.appearance.as_str()) {
            return Err(invalid(format!("unknown appearance {}", v.appearance)));
        }
        if variants[..i].iter().any(|w| w.appearance == v.appearance) {
            return Err(invalid("appearance twice"));
        }
    }
    Ok(())
}

fn check_sizes(sizes: &[u32]) -> Result<Vec<u32>, FsError> {
    let mut out: Vec<u32> = Vec::new();
    for s in sizes {
        if !PNG_SIZES.contains(s) {
            return Err(invalid(format!("size {s} is not offered")));
        }
        if !out.contains(s) {
            out.push(*s);
        }
    }
    if out.is_empty() {
        return Err(invalid("no size"));
    }
    Ok(out)
}

fn check_dir(dir: &Path) -> Result<(), FsError> {
    if !dir.is_absolute() {
        return Err(FsError::new(
            FsErrorCode::InvalidPath,
            "target folder must be absolute",
            Some(dir),
        ));
    }
    if !dir.is_dir() {
        let code = if dir.exists() {
            FsErrorCode::NotADirectory
        } else {
            FsErrorCode::NotFound
        };
        return Err(FsError::new(code, "target folder", Some(dir)));
    }
    Ok(())
}

/// All targets, checked against existing files unless `overwrite` (design 012 E11).
fn targets(
    dir: &Path,
    names: Vec<String>,
    overwrite: bool,
) -> Result<Vec<(String, PathBuf)>, FsError> {
    let list: Vec<(String, PathBuf)> = names
        .into_iter()
        .map(|n| (n.clone(), dir.join(n)))
        .collect();
    if !overwrite && let Some((_, p)) = list.iter().find(|(_, p)| p.exists()) {
        return Err(FsError::new(
            FsErrorCode::AlreadyExists,
            "file exists",
            Some(p),
        ));
    }
    Ok(list)
}

fn written(name: String, path: &Path, transparent: Option<bool>) -> ExportedFile {
    ExportedFile {
        name,
        path: path.to_string_lossy().into_owned(),
        transparent,
    }
}

/// Writes every variant as `<name>-<appearance>.svg`.
pub fn export_svg(
    variants: &[Variant],
    dir: &Path,
    opts: &ExportOptions,
) -> Result<ExportReport, FsError> {
    check_variants(variants)?;
    check_dir(dir)?;
    let base = file_base_name(&opts.base_name)?;
    let names = variants
        .iter()
        .map(|v| format!("{base}-{}.svg", v.appearance))
        .collect();
    let list = targets(dir, names, opts.overwrite)?;
    let mut files = Vec::new();
    for (v, (name, path)) in variants.iter().zip(list) {
        if v.svg.len() > super::MAX_SVG_BYTES {
            return Err(FsError::new(
                FsErrorCode::TooLarge,
                "SVG too large",
                Some(&path),
            ));
        }
        write_atomic(&path, v.svg.as_bytes()).map_err(|e| FsError::from_io(&e, &path))?;
        files.push(written(name, &path, None));
    }
    Ok(ExportReport {
        files,
        cancelled: false,
    })
}

/// Renders every variant in every size as `<name>-<appearance>-<size>.png` (largest first, as
/// given). `progress` after each file; `cancel` is checked before each file.
pub fn export_png(
    variants: &[Variant],
    sizes: &[u32],
    dir: &Path,
    opts: &ExportOptions,
    fonts: Arc<Database>,
    cancel: &AtomicBool,
    mut progress: impl FnMut(ExportProgress),
) -> Result<ExportReport, FsError> {
    check_variants(variants)?;
    let sizes = check_sizes(sizes)?;
    check_dir(dir)?;
    let base = file_base_name(&opts.base_name)?;
    let mut names = Vec::new();
    for v in variants {
        for s in &sizes {
            names.push(format!("{base}-{}-{s}.png", v.appearance));
        }
    }
    let list = targets(dir, names, opts.overwrite)?;
    let total = list.len() as u32;
    let mut files = Vec::new();
    let mut next = list.into_iter();
    for v in variants {
        let tree = parse(&v.svg, fonts.clone())?;
        for &size in &sizes {
            let (name, path) = next.next().expect("one target per file");
            if cancel.load(Ordering::SeqCst) {
                return Ok(ExportReport {
                    files,
                    cancelled: true,
                });
            }
            let pixmap = render(&tree, size)?;
            let bytes = encode(&pixmap)?;
            write_atomic(&path, &bytes).map_err(|e| FsError::from_io(&e, &path))?;
            files.push(written(
                name.clone(),
                &path,
                Some(has_transparency(&pixmap)),
            ));
            progress(ExportProgress {
                done: files.len() as u32,
                total,
                name,
            });
        }
    }
    Ok(ExportReport {
        files,
        cancelled: false,
    })
}

#[cfg(test)]
#[path = "files_tests.rs"]
mod tests;
