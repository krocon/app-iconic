//! One SVG → one pixmap with resvg (design 012 E8/E9). Nothing is loaded from outside: no
//! resources directory, `<image>` only from data URLs (also inside nested SVG data URLs, which
//! are parsed with the same options); fonts come from the given database.

use super::MAX_SVG_BYTES;
use crate::error::{FsError, FsErrorCode};
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::fontdb::{Database, Family};
use resvg::usvg::{ImageHrefResolver, Options, Tree};
use std::sync::Arc;

/// Stack of the thread that parses and renders: usvg and resvg recurse once per nesting level,
/// and a few hundred `<g>` already overflow the 2 MiB of a worker thread – which aborts the whole
/// app (prompt 031). Reserved address space only; the pages are used as deep as the SVG goes.
pub const RENDER_STACK: usize = 256 << 20;

/// Runs `f` on a thread with [`RENDER_STACK`] and waits for it.
pub fn deep<T: Send>(f: impl FnOnce() -> Result<T, FsError> + Send) -> Result<T, FsError> {
    std::thread::scope(|s| {
        std::thread::Builder::new()
            .name("render".into())
            .stack_size(RENDER_STACK)
            .spawn_scoped(s, f)
            .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?
            .join()
            .unwrap_or_else(|_| Err(FsError::new(FsErrorCode::Io, "rendering failed", None)))
    })
}

/// Parser options for untrusted SVG text: data URLs only, the given fonts.
pub fn safe_options(fonts: Arc<Database>) -> Options<'static> {
    // text without `font-family` uses the serif font, like a browser (not a fixed "Times New Roman")
    let font_family = fonts.family_name(&Family::Serif).to_string();
    Options {
        font_family,
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
    deep(|| {
        Tree::from_str(svg, &safe_options(fonts))
            .map_err(|e| FsError::new(FsErrorCode::InvalidSvg, e.to_string(), None))
    })
}

/// Renders `tree` into a square of `size` pixels (scaled to fit, transparent background).
pub fn render(tree: &Tree, size: u32) -> Result<Pixmap, FsError> {
    let mut pixmap = Pixmap::new(size, size)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidPath, "invalid size", None))?;
    let s = tree.size();
    let scale = (size as f32 / s.width()).min(size as f32 / s.height());
    deep(|| {
        resvg::render(
            tree,
            Transform::from_scale(scale, scale),
            &mut pixmap.as_mut(),
        );
        Ok(())
    })?;
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

/// A preview for the AI (design 018 E8): `svg` rendered at `size` px as base64 PNG, plus whether
/// it has transparent pixels.
pub fn preview_base64(
    svg: &str,
    size: u32,
    fonts: Arc<Database>,
) -> Result<(String, bool), FsError> {
    use base64::Engine;
    if !(16..=1024).contains(&size) {
        return Err(FsError::new(
            FsErrorCode::InvalidRequest,
            "size must be 16…1024",
            None,
        ));
    }
    let pixmap = render_png(svg, size, fonts)?;
    let png = encode(&pixmap)?;
    Ok((
        base64::engine::general_purpose::STANDARD.encode(png),
        has_transparency(&pixmap),
    ))
}

/// The colour of `svg` at the user-space point (`x`, `y`) as `#RRGGBBAA` (prompt 074 E3: the
/// eyedropper on images and gradients) – one pixel rendered by resvg, straight alpha.
pub fn pick_pixel(svg: &str, x: f64, y: f64, fonts: Arc<Database>) -> Result<String, FsError> {
    if !x.is_finite() || !y.is_finite() {
        return Err(FsError::new(
            FsErrorCode::InvalidRequest,
            "point must be finite",
            None,
        ));
    }
    let tree = parse(svg, fonts)?;
    let mut pixmap = Pixmap::new(1, 1)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidPath, "invalid size", None))?;
    let (tx, ty) = (-(x.floor() as f32), -(y.floor() as f32));
    deep(|| {
        resvg::render(
            &tree,
            Transform::from_translate(tx, ty),
            &mut pixmap.as_mut(),
        );
        Ok(())
    })?;
    let c = pixmap
        .pixel(0, 0)
        .ok_or_else(|| FsError::new(FsErrorCode::Io, "no pixel", None))?
        .demultiply();
    Ok(format!(
        "#{:02X}{:02X}{:02X}{:02X}",
        c.red(),
        c.green(),
        c.blue(),
        c.alpha()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::fonts::system_fonts;

    #[test]
    fn deep_nesting_renders_even_from_a_small_worker_stack() {
        // a 2 MiB thread like tokio's blocking pool; 1 000 groups aborted the process before (031)
        let nested = |depth: usize| {
            format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">{}<rect width="5" height="5"/>{}</svg>"#,
                r#"<g opacity="0.99">"#.repeat(depth),
                "</g>".repeat(depth)
            )
        };
        let results = std::thread::Builder::new()
            .stack_size(2 << 20)
            .spawn(move || {
                [1_000, 50_000].map(|d| render_png(&nested(d), 32, Arc::new(Database::new())))
            })
            .unwrap()
            .join()
            .unwrap();
        let [ok, too_deep] = results;
        assert!(ok.is_ok(), "{:?}", ok.err());
        // deeper than the XML parser allows: an error, no crash
        assert_eq!(too_deep.unwrap_err().code, FsErrorCode::InvalidSvg);
    }

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
    fn a_preview_is_a_base64_png_of_the_size() {
        use base64::Engine;
        let svg = icon(r##"<rect width="1024" height="1024" fill="#123456"/>"##);
        let (b64, transparent) = preview_base64(&svg, 64, empty_fonts()).unwrap();
        let png = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        assert!(!transparent);
        let e = preview_base64(&svg, 4096, empty_fonts()).unwrap_err();
        assert_eq!(e.code, FsErrorCode::InvalidRequest);
        let (_, transparent) = preview_base64(&icon(""), 16, empty_fonts()).unwrap();
        assert!(transparent);
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

    /// Prompt 064: the export SVG writes group / layer blend modes as `style="mix-blend-mode:…"`
    /// on a `<g>` (and a nested `<svg>` for a layer) – the analysis said resvg drops it. It does
    /// not: multiply of cyan over yellow is green.
    #[test]
    fn blend_modes_in_a_style_attribute_are_rendered() {
        for wrap in ["g", "svg"] {
            let svg = icon(&format!(
                r##"<rect width="1024" height="1024" fill="#ffff00"/><{wrap} style="mix-blend-mode:multiply"><rect width="1024" height="1024" fill="#00ffff"/></{wrap}>"##
            ));
            let p = render_png(&svg, 32, empty_fonts()).unwrap();
            assert!(
                close(rgba(&p, 16, 16), [0, 255, 0, 255]),
                "{wrap}: {:?}",
                rgba(&p, 16, 16)
            );
        }
        // and screen
        let svg = icon(
            r##"<rect width="1024" height="1024" fill="#ff0000"/><g style="mix-blend-mode:screen"><rect width="1024" height="1024" fill="#0000ff"/></g>"##,
        );
        let p = render_png(&svg, 32, empty_fonts()).unwrap();
        assert!(
            close(rgba(&p, 16, 16), [255, 0, 255, 255]),
            "{:?}",
            rgba(&p, 16, 16)
        );
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
    fn eight_digit_hex_alpha_is_half_transparent() {
        // the colour popover writes alpha as #RRGGBBAA (prompt 074 E1)
        let p = render_png(
            &icon(r##"<rect width="1024" height="1024" fill="#FF000080"/>"##),
            64,
            empty_fonts(),
        )
        .unwrap();
        assert!(
            close(rgba(&p, 32, 32), [255, 0, 0, 128]),
            "{:?}",
            rgba(&p, 32, 32)
        );
    }

    #[test]
    fn a_pixel_is_picked_from_a_gradient() {
        let svg = icon(
            r##"<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>"##,
        );
        let left = pick_pixel(&svg, 2.0, 500.0, empty_fonts()).unwrap();
        let right = pick_pixel(&svg, 1021.0, 500.0, empty_fonts()).unwrap();
        assert!(left.starts_with("#FE") || left.starts_with("#FF"), "{left}");
        assert!(
            right.ends_with("FFFF") || right.ends_with("FEFF"),
            "{right}"
        );
        assert_eq!(
            pick_pixel(&svg, 2000.0, 2000.0, empty_fonts()).unwrap(),
            "#00000000"
        );
        assert_eq!(
            pick_pixel(&svg, f64::NAN, 0.0, empty_fonts())
                .unwrap_err()
                .code,
            FsErrorCode::InvalidRequest
        );
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

    /// Clip paths of assets as the export builds them (design 014 E11): the asset root nested in a
    /// placement `<svg>`, a layer clip group, a node with its own `objectBoundingBox` clip inside
    /// a transformed group, ids prefixed per layer.
    #[test]
    fn asset_clip_paths_in_placement_svg() {
        let svg = icon(
            r##"<g><svg x="0" y="0" width="1024" height="1024" viewBox="0 0 100 100"><svg viewBox="0 0 100 100"><defs><clipPath id="l0-clip"><rect x="0" y="0" width="50" height="100"/></clipPath><clipPath id="l0-obb" clipPathUnits="objectBoundingBox"><rect x="0" y="0" width="1" height="0.5"/></clipPath></defs><g clip-path="url(#l0-clip)"><rect width="100" height="40" fill="#ff0000"/></g><g transform="translate(0 60)"><rect width="100" height="40" fill="#0000ff" clip-path="url(#l0-obb)"/></g></svg></svg></g>"##,
        );
        let p = render_png(&svg, 100, empty_fonts()).unwrap();
        // layer clip: left half red, right half cut away
        assert!(close(rgba(&p, 25, 20), [255, 0, 0, 255]));
        assert_eq!(rgba(&p, 75, 20)[3], 0);
        // OBB clip relative to the rect's own box (y 60 … 100 → upper half 60 … 80)
        assert!(close(rgba(&p, 50, 70), [0, 0, 255, 255]));
        assert_eq!(rgba(&p, 50, 90)[3], 0);
    }

    #[test]
    fn text_with_a_system_font() {
        let fonts = system_fonts();
        for family in [
            r#" font-family="sans-serif""#,
            r#" font-family="serif""#,
            "",
        ] {
            let svg = icon(&format!(
                r##"<text x="512" y="700"{family} font-size="600" text-anchor="middle" fill="#000">X</text>"##
            ));
            let p = render_png(&svg, 128, fonts.clone()).unwrap();
            let inked = p.pixels().iter().filter(|c| c.alpha() > 0).count();
            if fonts.is_empty() {
                eprintln!("no system fonts on this machine – text is skipped");
                assert_eq!(inked, 0);
            } else {
                assert!(inked > 200, "{family}: only {inked} pixels drawn");
            }
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
