//! Scenes of the mockup preview (prompt 081): the frontend composes a scene – the icon between
//! neutral placeholder icons on an own backdrop – as one SVG in points; this module renders it
//! with resvg at a scale (1 × … 4 ×) in its own aspect ratio (not square like the icon export) and
//! hands it to the clipboard ([`ImageSink`]) or writes it as PNG (atomic). Nothing is loaded from
//! outside (`png::safe_options`): the icon and a background image arrive as data URLs.

use super::png;
use crate::clipboard_image::{ImageSink, RgbaImage, straight_rgba};
use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::fontdb::Database;
use std::path::Path;
use std::sync::Arc;

/// Scales a scene can be rendered at (1 × = points, 2 × = Retina …).
pub const SCENE_SCALES: std::ops::RangeInclusive<u32> = 1..=4;
/// Longest side of a rendered scene in pixels.
pub const MAX_SCENE_EDGE: u32 = 4096;

fn bad(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidRequest, message, None)
}

/// The scene `svg` rendered at `scale` (its `width`/`height` × scale, rounded up).
pub fn render_scene(svg: &str, scale: u32, fonts: Arc<Database>) -> Result<Pixmap, FsError> {
    if !SCENE_SCALES.contains(&scale) {
        return Err(bad(format!("scale {scale} is not offered")));
    }
    let tree = png::parse(svg, fonts)?;
    let size = tree.size();
    let w = (size.width() * scale as f32).ceil() as u32;
    let h = (size.height() * scale as f32).ceil() as u32;
    if w == 0 || h == 0 || w > MAX_SCENE_EDGE || h > MAX_SCENE_EDGE {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            format!("scene of {w} × {h} px, limit {MAX_SCENE_EDGE}"),
            None,
        ));
    }
    let mut pixmap = Pixmap::new(w, h).ok_or_else(|| bad("invalid size"))?;
    png::deep(|| {
        resvg::render(
            &tree,
            Transform::from_scale(scale as f32, scale as f32),
            &mut pixmap.as_mut(),
        );
        Ok(())
    })?;
    Ok(pixmap)
}

/// Renders the scene and puts it into `sink` (the clipboard).
pub fn copy_scene(
    svg: &str,
    scale: u32,
    fonts: Arc<Database>,
    sink: &mut impl ImageSink,
) -> Result<(), FsError> {
    let pixmap = render_scene(svg, scale, fonts)?;
    let bytes = straight_rgba(&pixmap);
    sink.set_image(RgbaImage {
        width: pixmap.width(),
        height: pixmap.height(),
        bytes: &bytes,
    })
}

/// Renders the scene and writes it to `path` as PNG (temp file + rename).
pub fn write_scene(
    svg: &str,
    scale: u32,
    path: &Path,
    fonts: Arc<Database>,
) -> Result<(), FsError> {
    let pixmap = render_scene(svg, scale, fonts)?;
    let bytes = png::encode(&pixmap)?;
    write_atomic(path, &bytes).map_err(|e| FsError::from_io(&e, path))
}

/// A file name for the save dialog: no path separators or control characters, at most 80
/// characters, ending in `.png`; `scene.png` when nothing is left.
pub fn scene_file_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .take(80)
        .collect();
    let clean = clean.trim().trim_start_matches('.').trim();
    let stem = clean
        .strip_suffix(".png")
        .or_else(|| clean.strip_suffix(".PNG"))
        .unwrap_or(clean)
        .trim();
    if stem.is_empty() {
        "scene.png".to_string()
    } else {
        format!("{stem}.png")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::image_file::{ImageKind, detect};

    #[derive(Default)]
    struct Sink(Option<(u32, u32, Vec<u8>)>);

    impl ImageSink for Sink {
        fn set_image(&mut self, img: RgbaImage<'_>) -> Result<(), FsError> {
            self.0 = Some((img.width, img.height, img.bytes.to_vec()));
            Ok(())
        }
    }

    fn fonts() -> Arc<Database> {
        Arc::new(Database::new())
    }

    /// 30 × 10 points: left third red, the rest transparent; an icon as nested SVG data URL.
    const SCENE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="30" height="10" viewBox="0 0 30 10"><rect width="10" height="10" fill="#ff0000"/><image x="20" y="0" width="10" height="10" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMDAwMGZmIi8+PC9zdmc+"/></svg>"##;

    #[test]
    fn a_scene_keeps_its_aspect_ratio_at_every_scale() {
        for scale in [1, 2, 3] {
            let p = render_scene(SCENE, scale, fonts()).unwrap();
            assert_eq!((p.width(), p.height()), (30 * scale, 10 * scale));
        }
        let p = render_scene(SCENE, 2, fonts()).unwrap();
        let red = p.pixel(2, 2).unwrap().demultiply();
        assert_eq!((red.red(), red.alpha()), (255, 255));
        assert_eq!(p.pixel(30, 10).unwrap().alpha(), 0);
        // the nested icon (data URL) is drawn
        let blue = p.pixel(50, 10).unwrap().demultiply();
        assert_eq!((blue.blue(), blue.alpha()), (255, 255));
    }

    #[test]
    fn scales_and_sizes_are_limited() {
        for scale in [0, 5] {
            let e = render_scene(SCENE, scale, fonts()).unwrap_err();
            assert_eq!(e.code, FsErrorCode::InvalidRequest);
        }
        let huge = r#"<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="10"/>"#;
        assert_eq!(
            render_scene(huge, 3, fonts()).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert!(render_scene(huge, 2, fonts()).is_ok());
        assert_eq!(
            render_scene("<svg", 1, fonts()).unwrap_err().code,
            FsErrorCode::InvalidSvg
        );
    }

    #[test]
    fn external_references_are_never_loaded() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image width="10" height="10" href="file:///etc/hosts"/><image width="10" height="10" href="https://example.com/a.png"/></svg>"#;
        let p = render_scene(svg, 1, fonts()).unwrap();
        assert!(p.pixels().iter().all(|px| px.alpha() == 0));
    }

    #[test]
    fn copy_hands_straight_rgba_in_the_scene_size_to_the_sink() {
        let mut sink = Sink::default();
        copy_scene(SCENE, 1, fonts(), &mut sink).unwrap();
        let (w, h, bytes) = sink.0.unwrap();
        assert_eq!((w, h, bytes.len()), (30, 10, 30 * 10 * 4));
        assert_eq!(&bytes[..4], &[255, 0, 0, 255]);
        let mut sink = Sink::default();
        assert!(copy_scene(SCENE, 9, fonts(), &mut sink).is_err());
        assert!(sink.0.is_none());
    }

    #[test]
    fn write_saves_a_png_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Dock.png");
        write_scene(SCENE, 2, &path, fonts()).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(detect(&bytes), Some((ImageKind::Png, Some((60, 20)))));
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        // a failed render leaves no file
        let bad = dir.path().join("bad.png");
        assert!(write_scene("<svg", 1, &bad, fonts()).is_err());
        assert!(!bad.exists());
    }

    #[test]
    fn file_names_are_plain() {
        assert_eq!(
            scene_file_name("CamScanner – Dock"),
            "CamScanner – Dock.png"
        );
        assert_eq!(scene_file_name("a/b\\c:d.png"), "abcd.png");
        assert_eq!(scene_file_name("../.."), "scene.png");
        assert_eq!(scene_file_name("  "), "scene.png");
        assert_eq!(scene_file_name("x\n.PNG"), "x.png");
        assert_eq!(scene_file_name(&"a".repeat(200)).len(), 84);
    }
}
