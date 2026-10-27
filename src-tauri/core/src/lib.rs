//! `ai-core` – the AppIconic engine without Tauri (compiles and tests without GTK/WebKit).
//!
//! Module overview:
//! - [`error`]         structured, serialisable errors (`FsError { code, message, path }`)
//! - [`fs_atomic`]     atomic writes, keeping broken files aside (from files-and-folders)
//! - [`config_file`]   loader of small config files (from files-and-folders)
//! - [`recent`]        recently used `.icon` files, `recent.json` (prompt 003)
//! - [`icon`]          `.icon` files: icon.json with lossless round trip, bundle + ZIP I/O (prompt 002)
//! - [`menu_spec`]     the frontend's menu model for the native macOS menu, checked (prompt 005)
//! - [`keymap_file`]   the user's shortcut overrides `keymap.json` (prompt 005)
//! - [`export`]        export: SVG files, PNG with resvg in a size set (prompt 012)
//! - [`fonts`]         system fonts (once per process), font list, text to path (prompts 012, 013)

pub mod config_file;
pub mod error;
pub mod export;
pub mod fonts;
pub mod fs_atomic;
pub mod icon;
pub mod keymap_file;
pub mod menu_spec;
pub mod recent;
