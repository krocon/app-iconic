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
//! [`super::appiconset`], [`super::android`], [`super::web`]) + its source table in TS. The
//! rendering lives in [`super::package_render`].

use super::containers::ICO_SIZES;
use super::files::{check_dir, file_base_name};
use super::package_render::Renderer;
pub use super::package_render::encode_opaque;
use super::{ExportOptions, ExportProgress, ExportReport, ExportedFile, MAX_SVG_BYTES};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use crate::icon::bundle::{sibling, swap_into_place};
use resvg::usvg::fontdb::Database;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

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
    /// Android (prompt 079): the adaptive layers on 108 dp (canvas = the 72 dp viewport).
    pub const ANDROID_FOREGROUND: &str = "android-foreground";
    pub const ANDROID_BACKGROUND: &str = "android-background";
    pub const ANDROID_MONOCHROME: &str = "android-monochrome";
    /// Legacy launcher icons (before API 26): squircle and circle.
    pub const ANDROID_LEGACY: &str = "android-legacy";
    pub const ANDROID_ROUND: &str = "android-round";
    /// Google Play 512: full square, flattened.
    pub const ANDROID_PLAY: &str = "android-play";
    /// Web (prompt 079): `favicon.ico`, `icon-192/512` with the export choice's mask.
    pub const WEB_ANY: &str = "web-any";
    /// `favicon.svg`: light and dark switched by `prefers-color-scheme`, written as it is.
    pub const WEB_FAVICON: &str = "web-favicon";
    /// `apple-touch-icon.png`: unmasked, flattened.
    pub const WEB_TOUCH: &str = "web-touch";
    /// `icon-maskable-512.png`: canvas in the safe zone, fill to the edges.
    pub const WEB_MASKABLE: &str = "web-maskable";
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
    /// Android adaptive icon + legacy + Play Store (prompt 079, [`super::android`]).
    Android { monochrome: bool },
    /// Favicons, touch icon, PWA icons and manifest (prompt 079, [`super::web`]).
    Web,
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
    /// `sizes` of `source` (078: [`ICO_SIZES`], 079 favicon: 16, 32, 48).
    Ico {
        source: String,
        sizes: Vec<u32>,
    },
    /// The source's SVG text as it is (checked by parsing; 079 `favicon.svg`).
    Svg {
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
            Content::Png { source, .. }
            | Content::Icns { source }
            | Content::Ico { source, .. }
            | Content::Svg { source } => Some(source),
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
                        sizes: ICO_SIZES.to_vec(),
                    },
                }],
            }),
            PackageKind::Android { monochrome } => Ok(super::android::plan(*monochrome)),
            PackageKind::Web => Ok(super::web::plan()),
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
    let mut r = Renderer::new(sources, fonts, cancel);
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

#[cfg(test)]
#[path = "package_tests_079.rs"]
mod tests_079;
