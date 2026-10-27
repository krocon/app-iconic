//! Font commands (prompt 013): thin layer over `ai_core::fonts`, every command `async`, the work
//! in `spawn_blocking`. The system fonts and their catalog are built once per process (the app
//! warms them up at start, design 013 E8).

use crate::commands::blocking;
use crate::error::FsError;
use ai_core::fonts::outline::{TextPath, text_to_path as outline_text};
use ai_core::fonts::{FontFamily, system::system_fonts, system_catalog};

/// Every font family with its styles (`[{ family, styles: [{ name, weight, italic, id }] }]`).
#[tauri::command]
pub async fn list_fonts() -> Result<Vec<FontFamily>, FsError> {
    blocking(|| Ok(system_catalog().families.clone())).await
}

/// One line of text as path data in the font `font_id` (design 013 E9–E12).
#[tauri::command]
pub async fn text_to_path(
    text: String,
    font_id: String,
    size: f32,
    letter_spacing: f32,
) -> Result<TextPath, FsError> {
    blocking(move || {
        let db = system_fonts();
        let catalog = system_catalog();
        outline_text(&db, &catalog, &text, &font_id, size, letter_spacing)
    })
    .await
}

/// Loads the system fonts and their catalog on a background thread (first use is then quick).
pub fn warm_up() {
    std::thread::spawn(|| {
        let _ = system_catalog();
    });
}

#[cfg(test)]
mod tests {
    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("font_commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let next = lines.next().unwrap_or_default().trim();
                assert!(
                    next.starts_with("pub async fn"),
                    "synchronous command: {next}"
                );
                count += 1;
            }
        }
        assert_eq!(count, 2);
    }
}
