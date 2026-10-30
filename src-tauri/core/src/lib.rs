//! `ai-core` – the AppIconic engine without Tauri (compiles and tests without GTK/WebKit).
//!
//! Module overview:
//! - [`error`]         structured, serialisable errors (`FsError { code, message, path }`)
//! - [`fs_atomic`]     atomic writes, keeping broken files aside (from files-and-folders)
//! - [`config_file`]   loader of small config files (from files-and-folders)
//! - [`recent`]        recently used `.icon` files, `recent.json` (prompt 003)
//! - [`recovery`]      recovery snapshots of unsaved documents, owner locks per process (prompt 083)
//! - [`symbols`]       the own symbol library (cleaned SVGs) and the recently used symbols (prompt 084)
//! - [`thumbnails`]    preview images of the recent files in the config directory (prompt 082)
//! - [`icon`]          `.icon` files: icon.json with lossless round trip, bundle + ZIP I/O (prompt 002)
//! - [`settings`]      workspace settings `settings.json`: lenient per field, migration, patches (prompt 015)
//! - [`menu_spec`]     the frontend's menu model for the native macOS menu, checked (prompt 005)
//! - [`keymap_file`]   the user's shortcut overrides `keymap.json` (prompt 005)
//! - [`export`]        export: SVG files, PNG with resvg in a size set (prompt 012)
//! - [`fonts`]         system fonts (once per process), font list, text to path (prompts 012, 013)
//! - [`clipboard_image`] a clipboard image checked and encoded as PNG data URL (prompt 071)
//! - [`user_paths`]    paths the user handed over (dropped files), kind of a dropped file (prompt 071)

pub mod clipboard_image;
pub mod config_file;
pub mod error;
pub mod export;
pub mod fonts;
pub mod fs_atomic;
pub mod icon;
pub mod keymap_file;
pub mod menu_spec;
pub mod recent;
pub mod recovery;
pub mod settings;
pub mod symbols;
pub mod thumbnails;
pub mod user_paths;
