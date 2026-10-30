//! Export of the icon (prompt 012): the frontend builds one flat SVG per appearance
//! (`features/export/export-svg.ts`); this module writes them as `.svg` files or renders them
//! with resvg as PNGs in a size set. No Tauri – the commands in `export_commands.rs` are thin.
//!
//! - [`fonts`]  system fonts for `<text>`, loaded once per process (re-export of
//!   [`crate::fonts::system`], shared with text to path, prompt 013)
//! - [`png`]    one SVG → one pixmap, without loading anything from outside (design 012 E9)
//! - [`files`]  file names, overwrite check, atomic writes, progress and cancelling (E10–E13)
//! - [`package`] package exports (prompt 078): plan + one writer for folders and containers;
//!   [`appiconset`] Xcode icon set, [`containers`] `.icns`/`.ico`; 079: [`android`] adaptive
//!   icon, [`web`] favicons and PWA icons; 081: [`scene`] mockup scenes as PNG (own aspect ratio)

pub mod android;
pub mod appiconset;
pub mod containers;
pub mod files;
pub mod package;
mod package_render;
pub mod web;
pub use crate::fonts::system as fonts;
pub mod png;
pub mod scene;

use serde::{Deserialize, Serialize};

/// The PNG sizes the export offers (prompt 012).
pub const PNG_SIZES: [u32; 7] = [1024, 512, 256, 128, 64, 32, 16];

/// Largest SVG text of one variant (design 012 E9) – embedded PNG assets make it big.
pub const MAX_SVG_BYTES: usize = 64 << 20;

/// Appearances the export knows (file name part).
pub const APPEARANCES: [&str; 3] = ["light", "dark", "tinted"];

/// One appearance of the icon as SVG text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub appearance: String,
    pub svg: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    /// File name stem, usually the document name without `.icon`.
    pub base_name: String,
    /// Replace existing files (only after the user confirmed, design 012 E11).
    pub overwrite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub name: String,
    pub path: String,
    /// PNG only: at least one pixel is not opaque (Apple hint, design 012 E13).
    pub transparent: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub files: Vec<ExportedFile>,
    /// Stopped by `cancel_export`; the files written so far are complete.
    pub cancelled: bool,
    /// Package exports with a folder (`AppIcon.appiconset`, prompt 078): its path.
    #[serde(default)]
    pub folder: Option<String>,
}

/// Sent after every written PNG (design 012 E12).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub done: u32,
    pub total: u32,
    pub name: String,
}
