//! The start screen's recent files with preview images (prompt 082, design E4–E6). The previews
//! live in `<app config>/thumbnails/` (`ai_core::thumbnails`): one per entry of `recent.json`,
//! cleaned up with it. The WebView sends the icon as SVG and gets data URLs back – never a path
//! of that folder.

use crate::commands::{RecentLock, allowed, blocking, config_dir, exists};
use crate::error::FsError;
use crate::model::RecentEntryDto;
use ai_core::export::fonts::system_fonts;
use ai_core::recent;
use ai_core::thumbnails;
use ai_core::user_paths::UserPaths;
use tauri::{AppHandle, Manager};

/// Renders `svg` as the preview of `path` (after open/save). `false` when `path` is not (any
/// more) in `recent.json` – only listed files get a preview, so there are at most `MAX_RECENT`.
#[tauri::command]
pub async fn save_thumbnail(app: AppHandle, path: String, svg: String) -> Result<bool, FsError> {
    allowed(&app.state::<UserPaths>(), &path)?;
    let dir = config_dir(&app)?;
    blocking(move || {
        // render outside the lock: it may take a moment for a big icon
        let png = thumbnails::render(&svg, system_fonts())?;
        let lock = app.state::<RecentLock>();
        let _guard = lock.lock();
        let list = recent::load(&dir.join(recent::FILE_NAME)).value;
        let previews = dir.join(thumbnails::DIR_NAME);
        thumbnails::prune(&previews, &list);
        if !list.contains(&path) {
            return Ok(false);
        }
        thumbnails::store(&previews, &path, &png)?;
        Ok(true)
    })
    .await
}

/// The recent files that still exist, newest first, with folder and preview image.
#[tauri::command]
pub async fn recent_entries(app: AppHandle) -> Result<Vec<RecentEntryDto>, FsError> {
    let dir = config_dir(&app)?;
    let entries = blocking(move || {
        let list = recent::load(&dir.join(recent::FILE_NAME)).value;
        let previews = dir.join(thumbnails::DIR_NAME);
        Ok(recent::existing(&list, exists)
            .into_iter()
            .map(|path| RecentEntryDto {
                name: recent::display_name(&path),
                location: recent::display_dir(&path),
                thumbnail: thumbnails::data_url(&previews, &path),
                path,
            })
            .collect::<Vec<_>>())
    })
    .await?;
    // a trusted source like "Open Recent" (prompt 033 E1)
    app.state::<UserPaths>()
        .allow_str(entries.iter().map(|e| e.path.as_str()));
    Ok(entries)
}

#[cfg(test)]
mod command_rules {
    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("thumbnail_commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let next = lines.next().unwrap_or_default().trim();
                assert!(next.starts_with("pub async fn"), "synchronous: {next}");
                count += 1;
            }
        }
        assert_eq!(count, 2);
    }
}
