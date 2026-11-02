//! Tracing an image into an SVG layer (prompt 087): a PNG data URL and the options in, the SVG
//! markup with its size and a summary out (`ai_core::trace`). The frontend inserts it as a layer.

use crate::commands::blocking;
use crate::error::FsError;
use ai_core::trace::{TraceOptions, TraceResult, trace_data_url};

/// Traces `data_url` (`data:image/png;base64,…`, at most the image limits of `ai_core::trace`).
/// Errors: `invalid_image`, `too_large`, `invalid_request` (options out of range).
#[tauri::command]
pub async fn trace_image(data_url: String, options: TraceOptions) -> Result<TraceResult, FsError> {
    blocking(move || trace_data_url(&data_url, &options)).await
}

#[cfg(test)]
mod tests {
    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("trace_commands.rs");
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
        assert_eq!(count, 1);
    }
}
