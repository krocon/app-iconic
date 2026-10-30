//! AppIconic – Tauri backend (crate `app-iconic`, lib `ai_lib`).
//!
//! Module overview:
//! - [`model`]         DTOs of the app shared with the frontend (serde camelCase)
//! - [`about`]         data for the About dialog (version, platform)
//! - [`commands`]      thin Tauri command layer for files and recent files (validate, trusted
//!   paths only – prompt 033, `spawn_blocking`, never synchronous)
//! - [`window_commands`] document windows: titles, close takeover, start paths/actions (003)
//! - [`menu_commands`] menu model per window, shortcut overrides, the quit sequence (005)
//! - [`sessions`]      last opened/saved `.icon` per path (unchanged assets stay in Rust, 002 E5)
//! - [`windows`]       document windows: labels, start paths, close takeover, titles (003),
//!   start actions and the quit sequence (005)
//! - [`app_menu`]      native macOS menu bar from the menu model of the focused window (005)
//! - [`export_commands`] export SVG/PNG (resvg), folder dialog, progress and cancel per window (012)
//! - [`font_commands`] font list and text to path (013)
//! - [`settings_commands`] `settings.json` for every window: load, patches, reset, theme (015)
//! - [`mcp`]           AI control: the tool router over the windows (design 018)
//! - [`mcp_args`]      argument checks, bounds and file paths of the AI tools (018, 033)
//! - [`mcp_commands`]  the bridge for the `app-iconic-mcp` sidecar, calls to the windows (018)
//! - [`mcp_setup_commands`] set up Claude Desktop / Cursor, connection test of the sidecar (086)
//! - [`open_files`]    `.icon` files from the command line, a second start and the Finder (030)
//! - [`reveal`]        "Show in Finder" for files this process exported (030)
//! - [`drop_files`]    files dragged onto a window, images from the system clipboard (071)
//! - [`recovery_commands`] recovery snapshots of unsaved documents: write, offer, restore (083)
//! - [`symbol_commands`]   the own symbol library and the recently used symbols (084)
//! - [`thumbnail_commands`] preview images of the recent files for the start screen (082)
//!
//! The engine (icon documents, file I/O, export, fonts) lives in the Tauri-free crate
//! `ai-core` (`src-tauri/core`); `error` is re-exported from there.

pub mod about;
pub mod app_menu;
pub mod commands;
pub mod drop_files;
pub mod export_commands;
pub mod font_commands;
pub mod mcp;
pub mod mcp_args;
pub mod mcp_commands;
pub mod mcp_setup_commands;
pub mod menu_commands;
pub mod model;
pub mod open_files;
pub mod recovery_commands;
pub mod reveal;
pub mod sessions;
pub mod settings_commands;
pub mod symbol_commands;
pub mod thumbnail_commands;
pub mod window_commands;
pub mod windows;

pub use ai_core::error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // first: a second start (Windows/Linux, "Open with") hands its files to this one
        // (design 030 E5)
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let paths = open_files::paths_from_args(
                argv.into_iter().skip(1),
                Some(std::path::Path::new(&cwd)),
            );
            if paths.is_empty() {
                open_files::bring_to_front(app);
            } else {
                open_files::open_paths(app, paths);
            }
        }))
        // only the Rust API is used (open/save dialogs) – the WebView gets no `dialog:` permission
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(sessions::IconSessions::default())
        .manage(windows::DocWindows::default())
        .manage(commands::RecentLock::default())
        .manage(app_menu::MenuSpecs::default())
        .manage(export_commands::ExportJobs::default())
        .manage(settings_commands::SettingsState::default())
        .manage(mcp_commands::McpState::default())
        .manage(reveal::Exported::default())
        .manage(ai_core::user_paths::UserPaths::default())
        .manage(recovery_commands::RecoveryState::default())
        .manage(symbol_commands::SymbolLock::default())
        .setup(|app| {
            // system fonts for text to path and the PNG export, scanned in the background
            font_commands::warm_up();
            // settings first: the AI bridge is open from the start if it is on (design 018 E3)
            let handle = app.handle().clone();
            std::thread::spawn(move || settings_commands::load_at_start(&handle));
            // `.icon` files on the command line (design 030 E5)
            let cwd = std::env::current_dir().ok();
            let paths = open_files::paths_from_args(std::env::args().skip(1), cwd.as_deref());
            open_files::open_paths(app.handle(), paths);
            Ok(())
        })
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
                tauri::WindowEvent::Focused(true) => {
                    app_menu::on_focus(app, window.label());
                    app.state::<mcp_commands::McpState>()
                        .set_active(window.label());
                }
                tauri::WindowEvent::Destroyed => {
                    docs.forget(window.label());
                    app.state::<mcp_commands::McpState>()
                        .window_gone(window.label());
                    app_menu::on_destroyed(app, window.label());
                    if docs.quit(|q| q.closed(window.label())) {
                        menu_commands::advance_quit(app);
                    }
                }
                // files from Finder/Explorer (design 071 E1)
                tauri::WindowEvent::DragDrop(e) => drop_files::on_drag_drop(window, e),
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
            commands::read_image_file,
            commands::pick_image_file,
            drop_files::read_clipboard_image,
            drop_files::copy_png,
            drop_files::copy_scene_png,
            commands::recent_files,
            commands::add_recent_file,
            commands::clear_recent_files,
            thumbnail_commands::save_thumbnail,
            thumbnail_commands::recent_entries,
            recovery_commands::write_recovery,
            recovery_commands::list_recovery,
            recovery_commands::open_recovery,
            recovery_commands::discard_recovery,
            symbol_commands::list_symbols,
            symbol_commands::save_symbol,
            symbol_commands::update_symbol,
            symbol_commands::delete_symbol,
            symbol_commands::record_symbol_use,
            symbol_commands::import_symbols,
            symbol_commands::export_symbols,
            window_commands::set_window_title,
            window_commands::open_document_window,
            window_commands::focus_document_window,
            window_commands::window_start_path,
            window_commands::take_over_close,
            window_commands::close_window,
            window_commands::window_start_action,
            menu_commands::set_app_menu,
            menu_commands::load_keymap_overrides,
            menu_commands::save_keymap,
            menu_commands::quit_app,
            menu_commands::cancel_quit,
            export_commands::pick_export_dir,
            export_commands::export_svg,
            export_commands::export_png,
            export_commands::export_package,
            export_commands::pick_color,
            export_commands::save_scene_png,
            export_commands::cancel_export,
            reveal::reveal_export,
            commands::third_party_notices,
            font_commands::list_fonts,
            font_commands::text_to_path,
            settings_commands::load_settings,
            settings_commands::save_settings,
            settings_commands::reset_settings,
            settings_commands::set_window_theme,
            mcp_commands::mcp_info,
            mcp_commands::mcp_ready,
            mcp_commands::mcp_reply,
            mcp_commands::mcp_disconnect,
            mcp_setup_commands::mcp_clients,
            mcp_setup_commands::mcp_setup_preview,
            mcp_setup_commands::mcp_install,
            mcp_setup_commands::mcp_uninstall,
            mcp_setup_commands::mcp_test,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // a regular exit: the snapshots of this process are not needed (design 083 E8)
            if let tauri::RunEvent::Exit = _event {
                recovery_commands::release(_app);
            }
            // macOS: files from the Finder (double click, "Open with", drop on the Dock icon) –
            // also while the app runs (design 030 E5)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &_event {
                let paths = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                open_files::open_paths(_app, paths);
            }
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
                    let _ = window_commands::build_document_window(_app, &label);
                }
                _ => {}
            }
        });
}
