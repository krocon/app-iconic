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
//!
//! Coming with the prompts (`prompts/README.md`): `export` (resvg PNG, prompt 012), `fonts`
//! (fontdb + ttf-parser, prompt 013).

pub mod config_file;
pub mod error;
pub mod fs_atomic;
pub mod icon;
pub mod keymap_file;
pub mod menu_spec;
pub mod recent;
