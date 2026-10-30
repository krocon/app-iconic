//! Files dragged from Finder/Explorer onto a window (prompt 071) and images from the system
//! clipboard. The webview's own drop events are not used: Rust passes enter/over/drop/leave on to
//! the window it happened in as `file-drop` (positions in CSS pixels of the webview, paths with
//! their kind) and remembers dropped paths as chosen by the user (`UserPaths`, prompt 033).
//! The clipboard is read here with `arboard` – no Tauri clipboard plugin for the webview (001 E4).

use crate::commands::blocking;
use crate::error::{FsError, FsErrorCode};
use ai_core::clipboard_image::{self, ImageSink, ImageSource, RgbaImage};
use ai_core::export::fonts::system_fonts;
use ai_core::icon::image_file::ImageFile;
use ai_core::user_paths::{DropKind, UserPaths, drop_kind};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{DragDropEvent, Emitter, Manager, Window};

/// The event of a drag of files over a window.
pub const FILE_DROP: &str = "file-drop";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFile {
    pub path: String,
    pub kind: DropKind,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileDropDto {
    /// `enter`, `over`, `drop` or `leave`.
    pub phase: &'static str,
    /// Files (enter, drop; empty otherwise).
    pub files: Vec<DroppedFile>,
    /// CSS pixels from the top left of the webview (not for leave).
    pub x: f64,
    pub y: f64,
}

fn files(paths: &[PathBuf]) -> Vec<DroppedFile> {
    paths
        .iter()
        .map(|p| DroppedFile {
            path: p.to_string_lossy().into_owned(),
            kind: drop_kind(p),
        })
        .collect()
}

/// The event for the frontend; `scale` = device pixels per CSS pixel.
pub fn to_dto(event: &DragDropEvent, scale: f64) -> Option<FileDropDto> {
    let s = if scale > 0.0 { scale } else { 1.0 };
    let dto = |phase, files, x: f64, y: f64| FileDropDto {
        phase,
        files,
        x: x / s,
        y: y / s,
    };
    Some(match event {
        DragDropEvent::Enter { paths, position } => {
            dto("enter", files(paths), position.x, position.y)
        }
        DragDropEvent::Over { position } => dto("over", vec![], position.x, position.y),
        DragDropEvent::Drop { paths, position } => {
            dto("drop", files(paths), position.x, position.y)
        }
        DragDropEvent::Leave => dto("leave", vec![], 0.0, 0.0),
        _ => return None,
    })
}

/// `WindowEvent::DragDrop`: dropped paths count as chosen, the window gets `file-drop`.
pub fn on_drag_drop(window: &Window, event: &DragDropEvent) {
    if let DragDropEvent::Drop { paths, .. } = event {
        window
            .app_handle()
            .state::<UserPaths>()
            .allow(paths.iter().map(PathBuf::as_path));
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Some(dto) = to_dto(event, scale) {
        let _ = window.emit_to(window.label(), FILE_DROP, dto);
    }
}

/// The platform clipboard as image source.
struct SystemClipboard(arboard::Clipboard);

impl ImageSource for SystemClipboard {
    fn with_image<R>(&mut self, f: impl FnOnce(RgbaImage<'_>) -> R) -> Result<Option<R>, FsError> {
        match self.0.get_image() {
            Ok(img) => {
                let (Ok(width), Ok(height)) = (u32::try_from(img.width), u32::try_from(img.height))
                else {
                    return Err(FsError::new(FsErrorCode::TooLarge, "image too large", None));
                };
                Ok(Some(f(RgbaImage {
                    width,
                    height,
                    bytes: &img.bytes,
                })))
            }
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(e) => Err(FsError::new(FsErrorCode::Unavailable, e.to_string(), None)),
        }
    }
}

/// The clipboard's image as PNG data URL with its size; `None` if it holds no image.
#[tauri::command]
pub async fn read_clipboard_image() -> Result<Option<ImageFile>, FsError> {
    blocking(|| {
        let cb = arboard::Clipboard::new()
            .map_err(|e| FsError::new(FsErrorCode::Unavailable, e.to_string(), None))?;
        clipboard_image::read_image(&mut SystemClipboard(cb))
    })
    .await
}

fn unavailable(e: arboard::Error) -> FsError {
    FsError::new(FsErrorCode::Unavailable, e.to_string(), None)
}

impl ImageSink for SystemClipboard {
    fn set_image(&mut self, img: RgbaImage<'_>) -> Result<(), FsError> {
        self.0
            .set_image(arboard::ImageData {
                width: img.width as usize,
                height: img.height as usize,
                bytes: std::borrow::Cow::Borrowed(img.bytes),
            })
            .map_err(unavailable)
    }
}

/// The clipboard that wrote last stays alive: on X11/Wayland the data is served by the process
/// that owns it – dropping the `Clipboard` would take the image away again (prompt 078 E7).
static WRITER: Mutex<Option<SystemClipboard>> = Mutex::new(None);

/// The icon `svg` rendered in `size` px into the system clipboard (`file.copyPng`, prompt 078).
#[tauri::command]
pub async fn copy_png(svg: String, size: u32) -> Result<(), FsError> {
    blocking(move || {
        let mut keeper = WRITER.lock().unwrap_or_else(|e| e.into_inner());
        if keeper.is_none() {
            *keeper = Some(SystemClipboard(
                arboard::Clipboard::new().map_err(unavailable)?,
            ));
        }
        let cb = keeper.as_mut().expect("set above");
        clipboard_image::copy_svg(&svg, size, system_fonts(), cb)
    })
    .await
}

/// A mockup scene (prompt 081) rendered at `scale` into the system clipboard – the same writer as
/// `copy_png`.
#[tauri::command]
pub async fn copy_scene_png(svg: String, scale: u32) -> Result<(), FsError> {
    blocking(move || {
        let mut keeper = WRITER.lock().unwrap_or_else(|e| e.into_inner());
        if keeper.is_none() {
            *keeper = Some(SystemClipboard(
                arboard::Clipboard::new().map_err(unavailable)?,
            ));
        }
        let cb = keeper.as_mut().expect("set above");
        ai_core::export::scene::copy_scene(&svg, scale, system_fonts(), cb)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::PhysicalPosition;

    #[test]
    fn positions_become_css_pixels_and_paths_get_their_kind() {
        let e = DragDropEvent::Drop {
            paths: vec![PathBuf::from("/a/b.svg"), PathBuf::from("/a/c.icon")],
            position: PhysicalPosition::new(200.0, 100.0),
        };
        let dto = to_dto(&e, 2.0).unwrap();
        assert_eq!((dto.phase, dto.x, dto.y), ("drop", 100.0, 50.0));
        assert_eq!(dto.files[0].kind, DropKind::Svg);
        assert_eq!(dto.files[1].kind, DropKind::Icon);
        let json = serde_json::to_value(&dto).unwrap();
        assert_eq!(json["files"][1]["kind"], "icon");
        assert_eq!(to_dto(&DragDropEvent::Leave, 2.0).unwrap().phase, "leave");
    }
}
