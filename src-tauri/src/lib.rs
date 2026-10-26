//! AppIconic – Tauri backend (crate `app-iconic`, lib `ai_lib`).
//!
//! Module overview:
//! - [`model`]         DTOs of the app shared with the frontend (serde camelCase)
//! - [`about`]         data for the About dialog (version, platform)
//! - [`commands`]      thin Tauri command layer (validate, `spawn_blocking`, never synchronous)
//!
//! The engine (icon documents, file I/O, export, fonts) lives in the Tauri-free crate
//! `ai-core` (`src-tauri/core`); `error` is re-exported from there.

pub mod about;
pub mod commands;
pub mod model;

pub use ai_core::error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // only the Rust API is used (open/save dialogs) – the WebView gets no `dialog:` permission
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![commands::get_app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
