//! AppIconic – Tauri backend (crate `app-iconic`, lib `ai_lib`).
//!
//! Module overview:
//! - [`model`]         DTOs of the app shared with the frontend (serde camelCase)
//! - [`about`]         data for the About dialog (version, platform)
//! - [`commands`]      thin Tauri command layer (validate, `spawn_blocking`, never synchronous)
//! - [`sessions`]      last opened/saved `.icon` per path (unchanged assets stay in Rust, 002 E5)
//! - [`windows`]       document windows: labels, start paths, close takeover, titles (003),
//!   start actions and the quit sequence (005)
//! - [`app_menu`]      native macOS menu bar from the menu model of the focused window (005)
//!
//! The engine (icon documents, file I/O, export, fonts) lives in the Tauri-free crate
//! `ai-core` (`src-tauri/core`); `error` is re-exported from there.

pub mod about;
pub mod app_menu;
pub mod commands;
pub mod model;
pub mod sessions;
pub mod windows;

pub use ai_core::error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // only the Rust API is used (open/save dialogs) – the WebView gets no `dialog:` permission
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(sessions::IconSessions::default())
        .manage(windows::DocWindows::default())
        .manage(commands::RecentLock::default())
        .manage(app_menu::MenuSpecs::default())
        // native menu (macOS): a click is an action of the focused window; Quit asks every
        // window (design 005 E6, E13)
        .on_menu_event(|app, event| app_menu::route(app, event.id().0.clone()))
        // unsaved changes: a window that took over closing asks the user first (design 003 E10)
        .on_window_event(|window, event| {
            use tauri::{Emitter, Manager};
            let app = window.app_handle();
            let docs = app.state::<windows::DocWindows>();
            match event {
                tauri::WindowEvent::CloseRequested { api, .. }
                    if docs.takes_close(window.label()) =>
                {
                    api.prevent_close();
                    let _ = window.emit_to(window.label(), windows::CLOSE_REQUESTED, ());
                }
                tauri::WindowEvent::Focused(true) => app_menu::on_focus(app, window.label()),
                tauri::WindowEvent::Destroyed => {
                    docs.forget(window.label());
                    app_menu::on_destroyed(app, window.label());
                    if docs.quit(|q| q.closed(window.label())) {
                        commands::advance_quit(app);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::open_icon,
            commands::new_icon,
            commands::save_icon,
            commands::close_icon,
            commands::read_svg_file,
            commands::pick_open_icon,
            commands::pick_save_icon,
            commands::pick_svg_file,
            commands::recent_files,
            commands::add_recent_file,
            commands::clear_recent_files,
            commands::set_window_title,
            commands::open_document_window,
            commands::focus_document_window,
            commands::window_start_path,
            commands::take_over_close,
            commands::close_window,
            commands::window_start_action,
            commands::set_app_menu,
            commands::load_keymap_overrides,
            commands::quit_app,
            commands::cancel_quit,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: the app stays open without windows (menu bar); a click on the Dock icon
            // opens a new document window (design 003 E10). Elsewhere the last window ends it.
            #[cfg(target_os = "macos")]
            match _event {
                tauri::RunEvent::ExitRequested {
                    code: None, api, ..
                } => api.prevent_exit(),
                tauri::RunEvent::Reopen {
                    has_visible_windows: false,
                    ..
                } => {
                    use tauri::Manager;
                    let label = _app.state::<windows::DocWindows>().new_label(None);
                    let _ = commands::build_document_window(_app, &label);
                }
                _ => {}
            }
        });
}
