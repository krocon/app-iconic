//! One SVG → one pixmap with resvg (design 012 E8/E9). Nothing is loaded from outside: no
//! resources directory, `<image>` only from data URLs (also inside nested SVG data URLs, which
//! are parsed with the same options); fonts come from the given database.

use super::MAX_SVG_BYTES;
use crate::error::{FsError, FsErrorCode};
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::fontdb::Database;
use resvg::usvg::{ImageHrefResolver, Options, Tree};
use std::sync::Arc;

/// Parser options for untrusted SVG text: data URLs only, the given fonts.
pub fn safe_options(fonts: Arc<Database>) -> Options<'static> {
    Options {
        resources_dir: None,
        image_href_resolver: ImageHrefResolver {
            resolve_data: ImageHrefResolver::default_data_resolver(),
            // file paths and URLs (`file:`, `http:` …) are never followed
            resolve_string: Box::new(|_, _| None),
        },
        fontdb: fonts,
        ..Options::default()
    }
}

/// Parses `svg` once (for several sizes).
pub fn parse(svg: &str, fonts: Arc<Database>) -> Result<Tree, FsError> {
    if svg.len() > MAX_SVG_BYTES {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            format!("SVG has {} bytes, limit {MAX_SVG_BYTES}", svg.len()),
            None,
        ));
    }
    Tree::from_str(svg, &safe_options(fonts))
        .map_err(|e| FsError::new(FsErrorCode::InvalidSvg, e.to_string(), None))
}

/// Renders `tree` into a square of `size` pixels (scaled to fit, transparent background).
pub fn render(tree: &Tree, size: u32) -> Result<Pixmap, FsError> {
    let mut pixmap = Pixmap::new(size, size)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidPath, "invalid size", None))?;
    let s = tree.size();
    let scale = (size as f32 / s.width()).min(size as f32 / s.height());
    resvg::render(
        tree,
        Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    Ok(pixmap)
}

/// Parse and render in one step.
pub fn render_png(svg: &str, size: u32, fonts: Arc<Database>) -> Result<Pixmap, FsError> {
    render(&parse(svg, fonts)?, size)
}

/// At least one pixel is not fully opaque (design 012 E13).
pub fn has_transparency(pixmap: &Pixmap) -> bool {
    pixmap.pixels().iter().any(|p| p.alpha() < 255)
}

/// PNG bytes of a pixmap.
pub fn encode(pixmap: &Pixmap) -> Result<Vec<u8>, FsError> {
    pixmap
        .encode_png()
        .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::fonts::system_fonts;

    fn empty_fonts() -> Arc<Database> {
        Arc::new(Database::new())
    }

    /// Straight (not premultiplied) RGBA of a pixel.
    fn rgba(p: &Pixmap, x: u32, y: u32) -> [u8; 4] {
        let c = p.pixel(x, y).unwrap().demultiply();
        [c.red(), c.green(), c.blue(), c.alpha()]
    }

    fn close(a: [u8; 4], b: [u8; 4]) -> bool {
        a.iter().zip(b).all(|(x, y)| x.abs_diff(y) <= 6)
    }

    fn icon(body: &str) -> String {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">{body}</svg>"#
        )
    }

    #[test]
    fn renders_every_size_square() {
        let tree = parse(
            &icon(r##"<rect width="1024" height="1024" fill="#f00"/>"##),
            empty_fonts(),
        )
        .unwrap();
        for size in crate::export::PNG_SIZES {
            let p = render(&tree, size).unwrap();
            assert_eq!((p.width(), p.height()), (size, size));
            assert!(close(rgba(&p, size / 2, size / 2), [255, 0, 0, 255]));
            assert!(!has_transparency(&p));
        }
    }

    #[test]
    fn solid_fill_with_opacity() {
        let p = render_png(
            &icon(r##"<rect width="1024" height="1024" fill="#00ff00" fill-opacity="0.5"/>"##),
            64,
            empty_fonts(),
        )
        .unwrap();
        assert!(close(rgba(&p, 32, 32), [0, 255, 0, 128]));
        assert!(has_transparency(&p));
    }

    #[test]
    fn linear_gradient_top_to_bottom() {
        let svg = icon(
            r##"<defs><linearGradient id="g" x1="0.5" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>"##,
        );
        let p = render_png(&svg, 256, empty_fonts()).unwrap();
        let top = rgba(&p, 128, 1);
        let bottom = rgba(&p, 128, 254);
        assert!(top[0] > 240 && top[2] < 15, "{top:?}");
        assert!(bottom[2] > 240 && bottom[0] < 15, "{bottom:?}");
        let mid = rgba(&p, 128, 128);
        assert!(mid[0].abs_diff(mid[2]) < 12, "{mid:?}");
    }

    #[test]
    fn radial_gradient_centre_to_edge() {
        let svg = icon(
            r##"<defs><radialGradient id="r" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#r)"/>"##,
        );
        let p = render_png(&svg, 128, empty_fonts()).unwrap();
        assert!(rgba(&p, 64, 64)[0] > 240);
        assert!(rgba(&p, 1, 1)[0] < 10, "corner beyond r = black (pad)");
    }

    #[test]
    fn clip_path_masks_the_corners() {
        let svg = icon(
            r##"<defs><clipPath id="m"><circle cx="512" cy="512" r="512"/></clipPath></defs><g clip-path="url(#m)"><rect width="1024" height="1024" fill="#000"/></g>"##,
        );
        let p = render_png(&svg, 64, empty_fonts()).unwrap();
        assert_eq!(rgba(&p, 0, 0)[3], 0);
        assert_eq!(rgba(&p, 32, 32)[3], 255);
        assert!(has_transparency(&p));
    }

    #[test]
    fn text_with_a_system_font() {
        let fonts = system_fonts();
        let svg = icon(
            r##"<text x="512" y="700" font-family="sans-serif" font-size="600" text-anchor="middle" fill="#000">X</text>"##,
        );
        let p = render_png(&svg, 128, fonts.clone()).unwrap();
        let inked = p.pixels().iter().filter(|c| c.alpha() > 0).count();
        if fonts.is_empty() {
            eprintln!("no system fonts on this machine – text is skipped");
            assert_eq!(inked, 0);
        } else {
            assert!(inked > 200, "only {inked} pixels drawn");
        }
    }

    fn red_png() -> Vec<u8> {
        let mut p = Pixmap::new(4, 4).unwrap();
        p.fill(resvg::tiny_skia::Color::from_rgba8(255, 0, 0, 255));
        p.encode_png().unwrap()
    }

    #[test]
    fn data_url_images_are_drawn() {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(red_png());
        let svg = icon(&format!(
            r#"<image x="0" y="0" width="1024" height="1024" href="data:image/png;base64,{b64}"/>"#
        ));
        let p = render_png(&svg, 32, empty_fonts()).unwrap();
        assert!(close(rgba(&p, 16, 16), [255, 0, 0, 255]));
    }

    #[test]
    fn external_references_are_not_loaded() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("red.png");
        std::fs::write(&file, red_png()).unwrap();
        let path = file.to_string_lossy();
        for href in [
            format!("file://{path}"),
            path.to_string(),
            "red.png".into(),
            "https://example.com/red.png".into(),
        ] {
            let svg = icon(&format!(
                r#"<image x="0" y="0" width="1024" height="1024" xlink:href="{href}"/><image x="0" y="0" width="1024" height="1024" href="{href}"/>"#
            ));
            let tree = Tree::from_str(&svg, &{
                let mut o = safe_options(empty_fonts());
                // even with a resources directory set by mistake nothing is read
                o.resources_dir = Some(dir.path().to_path_buf());
                o
            })
            .unwrap();
            let p = render(&tree, 32).unwrap();
            assert_eq!(rgba(&p, 16, 16)[3], 0, "{href} was loaded");
        }
    }

    #[test]
    fn nested_svg_data_urls_do_not_load_files_either() {
        use base64::Engine;
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("red.png");
        std::fs::write(&file, red_png()).unwrap();
        let inner = icon(&format!(
            r#"<image width="1024" height="1024" href="file://{}"/>"#,
            file.to_string_lossy()
        ));
        let b64 = base64::engine::general_purpose::STANDARD.encode(inner);
        let svg = icon(&format!(
            r#"<image width="1024" height="1024" href="data:image/svg+xml;base64,{b64}"/>"#
        ));
        let p = render_png(&svg, 32, empty_fonts()).unwrap();
        assert_eq!(rgba(&p, 16, 16)[3], 0);
    }

    #[test]
    fn limits_and_bad_input() {
        let huge = format!("{}{}", icon(""), " ".repeat(MAX_SVG_BYTES));
        assert_eq!(
            render_png(&huge, 16, empty_fonts()).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert_eq!(
            render_png("<svg", 16, empty_fonts()).unwrap_err().code,
            FsErrorCode::InvalidSvg
        );
        let tree = parse(&icon(""), empty_fonts()).unwrap();
        assert!(render(&tree, 0).is_err());
    }

    #[test]
    fn png_bytes_decode_again() {
        let p = render_png(
            &icon(r##"<rect width="512" height="1024" fill="#123456"/>"##),
            16,
            empty_fonts(),
        )
        .unwrap();
        let bytes = encode(&p).unwrap();
        assert_eq!(&bytes[1..4], b"PNG");
        let back = Pixmap::decode_png(&bytes).unwrap();
        assert_eq!((back.width(), back.height()), (16, 16));
        assert!(close(rgba(&back, 2, 8), [0x12, 0x34, 0x56, 255]));
        assert_eq!(rgba(&back, 12, 8)[3], 0);
    }
}
