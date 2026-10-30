//! Package exports (prompt 078 E1): several rendered files in one go – an Xcode
//! `AppIcon.appiconset` folder, an `.icns`, an `.ico` (079: Android, Web). A [`PackageKind`]
//! (from the frontend, serialisable) becomes a [`PackagePlan`]: an optional folder and a list of
//! files, each a text, a PNG of a *source* in one size (optionally flattened onto a colour, then
//! without alpha channel) or a container of PNGs. The sources are SVG texts the frontend built
//! (`features/export/export-packages.ts`: which appearance, mask, frame per source id).
//!
//! The writer is the same for every kind: sources parsed once, every size rendered once, progress
//! after every file, `cancel` between files and between renders, nothing replaced without
//! `overwrite`. A folder is built next to the target and swapped in (`bundle::swap_into_place`,
//! like saving an `.icon`): it appears complete or not at all – a cancelled package leaves nothing.
//!
//! A new package kind = one enum variant + its `plan` (here or in its own module, like
//! [`super::appiconset`]) + its source table in TS.

use super::containers::{ICNS_TYPES, ICO_SIZES, write_icns, write_ico};
use super::files::{check_dir, file_base_name};
use super::png::{encode, has_transparency, parse, render};
use super::{ExportOptions, ExportProgress, ExportReport, ExportedFile, MAX_SVG_BYTES};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use crate::icon::bundle::{sibling, swap_into_place};
use resvg::tiny_skia::Pixmap;
use resvg::usvg::Tree;
use resvg::usvg::fontdb::Database;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// Most sources of one package.
pub const MAX_SOURCES: usize = 8;

/// The source ids (TS `export-packages.ts` uses the same).
pub mod source {
    pub const IOS_LIGHT: &str = "ios-light";
    pub const IOS_DARK: &str = "ios-dark";
    pub const IOS_TINTED: &str = "ios-tinted";
    /// macOS: squircle mask with margin and shadow (Apple's template, design 078 E4).
    pub const MACOS: &str = "macos";
    pub const WATCHOS: &str = "watchos";
    /// Windows `.ico`: the export choice's mask.
    pub const WINDOWS: &str = "windows";
}

/// One SVG the frontend built for a package.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSource {
    pub id: String,
    pub svg: String,
}

/// What to export (serialisable, from the frontend and the AI).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PackageKind {
    /// Xcode `AppIcon.appiconset` (design 078 E2–E5). `appearances`: iOS variants besides the
    /// default (`dark`, `tinted`; `light` is always there).
    AppIconSet {
        ios: bool,
        appearances: Vec<String>,
        macos: bool,
        watchos: bool,
    },
    /// `<name>.icns` (macOS, E6).
    Icns,
    /// `<name>.ico` (Windows, E6).
    Ico,
}

/// What one planned file holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Content {
    Text(String),
    /// `source` rendered in `size` px; with `background` flattened onto it and written as RGB
    /// PNG without alpha channel (App Store icons, design 078 E3).
    Png {
        source: String,
        size: u32,
        background: Option<[u8; 3]>,
    },
    /// All [`ICNS_TYPES`] of `source`.
    Icns {
        source: String,
    },
    /// All [`ICO_SIZES`] of `source`.
    Ico {
        source: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedFile {
    /// Relative, `/`-separated, inside the folder (or the target folder without one).
    pub path: String,
    pub content: Content,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackagePlan {
    /// Folder written as a whole (atomic swap); `None` = the files go straight into the target.
    pub folder: Option<String>,
    pub files: Vec<PlannedFile>,
}

impl PlannedFile {
    pub fn text(path: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            content: Content::Text(text.into()),
        }
    }

    pub fn png(path: impl Into<String>, source: &str, size: u32, bg: Option<[u8; 3]>) -> Self {
        Self {
            path: path.into(),
            content: Content::Png {
                source: source.into(),
                size,
                background: bg,
            },
        }
    }

    fn sources(&self) -> Option<&str> {
        match &self.content {
            Content::Text(_) => None,
            Content::Png { source, .. } | Content::Icns { source } | Content::Ico { source } => {
                Some(source)
            }
        }
    }
}

pub(crate) fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidRequest, message, None)
}

impl PackageKind {
    /// The files of this kind for the file name stem `base` (already cleaned).
    pub fn plan(&self, base: &str) -> Result<PackagePlan, FsError> {
        match self {
            PackageKind::AppIconSet {
                ios,
                appearances,
                macos,
                watchos,
            } => super::appiconset::plan(*ios, appearances, *macos, *watchos),
            PackageKind::Icns => Ok(PackagePlan {
                folder: None,
                files: vec![PlannedFile {
                    path: format!("{base}.icns"),
                    content: Content::Icns {
                        source: source::MACOS.into(),
                    },
                }],
            }),
            PackageKind::Ico => Ok(PackagePlan {
                folder: None,
                files: vec![PlannedFile {
                    path: format!("{base}.ico"),
                    content: Content::Ico {
                        source: source::WINDOWS.into(),
                    },
                }],
            }),
        }
    }
}

/// A relative path of plain components (no `..`, no `\`, nothing absolute).
fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && path
            .split('/')
            .all(|c| !c.is_empty() && c != "." && c != ".." && !c.contains(':'))
}

fn check_plan(plan: &PackagePlan, sources: &[PackageSource]) -> Result<(), FsError> {
    if plan.files.is_empty() {
        return Err(invalid("nothing to export"));
    }
    if let Some(f) = &plan.folder
        && (!safe_relative(f) || f.contains('/'))
    {
        return Err(invalid("bad folder name"));
    }
    for f in &plan.files {
        if !safe_relative(&f.path) {
            return Err(invalid(format!("bad file path {}", f.path)));
        }
    }
    if sources.len() > MAX_SOURCES {
        return Err(invalid("too many sources"));
    }
    for (i, s) in sources.iter().enumerate() {
        if sources[..i].iter().any(|t| t.id == s.id) {
            return Err(invalid(format!("source {} twice", s.id)));
        }
        if s.svg.len() > MAX_SVG_BYTES {
            return Err(FsError::new(FsErrorCode::TooLarge, "SVG too large", None));
        }
        if !plan.files.iter().any(|f| f.sources() == Some(&s.id)) {
            return Err(invalid(format!("source {} is not used", s.id)));
        }
    }
    for f in &plan.files {
        if let Some(id) = f.sources()
            && !sources.iter().any(|s| s.id == id)
        {
            return Err(invalid(format!("source {id} is missing")));
        }
    }
    Ok(())
}

/// PNG bytes of `pixmap` flattened onto `bg` (premultiplied over), RGB without alpha channel.
pub fn encode_opaque(pixmap: &Pixmap, bg: [u8; 3]) -> Result<Vec<u8>, FsError> {
    let mut rgb = Vec::with_capacity(pixmap.width() as usize * pixmap.height() as usize * 3);
    for p in pixmap.pixels() {
        let rest = 255 - u16::from(p.alpha());
        for (c, b) in [p.red(), p.green(), p.blue()].into_iter().zip(bg) {
            rgb.push((u16::from(c) + (u16::from(b) * rest + 127) / 255).min(255) as u8);
        }
    }
    let io = |e: png::EncodingError| FsError::new(FsErrorCode::Io, e.to_string(), None);
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, pixmap.width(), pixmap.height());
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header()
        .map_err(io)?
        .write_image_data(&rgb)
        .map_err(io)?;
    Ok(out)
}

/// Parses each source once and renders each size once.
struct Renderer<'a> {
    sources: &'a [PackageSource],
    fonts: Arc<Database>,
    cancel: &'a AtomicBool,
    trees: HashMap<String, Tree>,
    pixmaps: HashMap<(String, u32), Pixmap>,
}

/// `Ok(None)`: cancelled.
type Step<T> = Result<Option<T>, FsError>;

impl Renderer<'_> {
    fn pixmap(&mut self, id: &str, size: u32) -> Step<&Pixmap> {
        let key = (id.to_string(), size);
        if !self.pixmaps.contains_key(&key) {
            if self.cancel.load(Ordering::SeqCst) {
                return Ok(None);
            }
            if !self.trees.contains_key(id) {
                let svg = &self
                    .sources
                    .iter()
                    .find(|s| s.id == id)
                    .ok_or_else(|| invalid("source is missing"))?
                    .svg;
                self.trees
                    .insert(id.to_string(), parse(svg, self.fonts.clone())?);
            }
            let p = render(&self.trees[id], size)?;
            self.pixmaps.insert(key.clone(), p);
        }
        Ok(Some(&self.pixmaps[&key]))
    }

    fn pngs(&mut self, id: &str, sizes: impl Iterator<Item = u32>) -> Step<Vec<(u32, Vec<u8>)>> {
        let mut out = Vec::new();
        for s in sizes {
            let Some(p) = self.pixmap(id, s)? else {
                return Ok(None);
            };
            out.push((s, encode(p)?));
        }
        Ok(Some(out))
    }

    /// Bytes of a file and whether the image has transparent pixels (PNG only).
    fn produce(&mut self, content: &Content) -> Step<(Vec<u8>, Option<bool>)> {
        Ok(Some(match content {
            Content::Text(t) => (t.as_bytes().to_vec(), None),
            Content::Png {
                source,
                size,
                background,
            } => {
                let Some(p) = self.pixmap(source, *size)? else {
                    return Ok(None);
                };
                match background {
                    Some(bg) => (encode_opaque(p, *bg)?, Some(false)),
                    None => (encode(p)?, Some(has_transparency(p))),
                }
            }
            Content::Icns { source } => {
                let Some(pngs) = self.pngs(source, ICNS_TYPES.iter().map(|(_, s)| *s))? else {
                    return Ok(None);
                };
                let elements: Vec<(&[u8; 4], &[u8])> = ICNS_TYPES
                    .iter()
                    .zip(&pngs)
                    .map(|((ty, _), (_, d))| (*ty, d.as_slice()))
                    .collect();
                (write_icns(&elements)?, None)
            }
            Content::Ico { source } => {
                let Some(pngs) = self.pngs(source, ICO_SIZES.into_iter())? else {
                    return Ok(None);
                };
                let images: Vec<(u32, &[u8])> =
                    pngs.iter().map(|(s, d)| (*s, d.as_slice())).collect();
                (write_ico(&images)?, None)
            }
        }))
    }
}

fn cancelled(files: Vec<ExportedFile>) -> ExportReport {
    ExportReport {
        files,
        cancelled: true,
        folder: None,
    }
}

fn file_entry(name: &str, path: &Path, transparent: Option<bool>) -> ExportedFile {
    ExportedFile {
        name: name.to_string(),
        path: path.to_string_lossy().into_owned(),
        transparent,
    }
}

fn write_into(root: &Path, rel: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let path = rel.split('/').fold(root.to_path_buf(), |p, c| p.join(c));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, bytes)?;
    Ok(path)
}

/// Exports a package of `kind` from `sources` into `dir` (see the module comment).
pub fn export_package(
    kind: &PackageKind,
    sources: &[PackageSource],
    dir: &Path,
    opts: &ExportOptions,
    fonts: Arc<Database>,
    cancel: &AtomicBool,
    mut progress: impl FnMut(ExportProgress),
) -> Result<ExportReport, FsError> {
    let base = file_base_name(&opts.base_name)?;
    let plan = kind.plan(&base)?;
    check_plan(&plan, sources)?;
    check_dir(dir)?;
    let targets: Vec<PathBuf> = match &plan.folder {
        Some(f) => vec![dir.join(f)],
        None => plan.files.iter().map(|f| dir.join(&f.path)).collect(),
    };
    if !opts.overwrite
        && let Some(p) = targets.iter().find(|p| fs::symlink_metadata(p).is_ok())
    {
        return Err(FsError::new(
            FsErrorCode::AlreadyExists,
            "file exists",
            Some(p),
        ));
    }
    let mut r = Renderer {
        sources,
        fonts,
        cancel,
        trees: HashMap::new(),
        pixmaps: HashMap::new(),
    };
    let total = plan.files.len() as u32;
    let mut files = Vec::new();
    if plan.folder.is_none() {
        // single files (icns, ico): each written atomically when it is complete
        for (f, target) in plan.files.iter().zip(&targets) {
            let Some((bytes, transparent)) = r.produce(&f.content)? else {
                return Ok(cancelled(files));
            };
            write_atomic(target, &bytes).map_err(|e| FsError::from_io(&e, target))?;
            files.push(file_entry(&f.path, target, transparent));
            progress(ExportProgress {
                done: files.len() as u32,
                total,
                name: f.path.clone(),
            });
        }
        return Ok(ExportReport {
            files,
            cancelled: false,
            folder: None,
        });
    }
    let target = &targets[0];
    let io_err = |e: std::io::Error| FsError::from_io(&e, target);
    let tmp = sibling(target, "tmp").map_err(io_err)?;
    let built = (|| -> Result<bool, FsError> {
        fs::create_dir(&tmp).map_err(io_err)?;
        for f in &plan.files {
            let Some((bytes, transparent)) = r.produce(&f.content)? else {
                return Ok(false);
            };
            write_into(&tmp, &f.path, &bytes).map_err(io_err)?;
            let final_path = f.path.split('/').fold(target.clone(), |p, c| p.join(c));
            files.push(file_entry(&f.path, &final_path, transparent));
            progress(ExportProgress {
                done: files.len() as u32,
                total,
                name: f.path.clone(),
            });
        }
        swap_into_place(&tmp, target).map_err(io_err)?;
        Ok(true)
    })();
    match built {
        Ok(true) => Ok(ExportReport {
            files,
            cancelled: false,
            folder: Some(target.to_string_lossy().into_owned()),
        }),
        Ok(false) => {
            let _ = fs::remove_dir_all(&tmp);
            Ok(cancelled(Vec::new()))
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&tmp);
            Err(e)
        }
    }
}

#[cfg(test)]
#[path = "package_tests.rs"]
mod tests;
