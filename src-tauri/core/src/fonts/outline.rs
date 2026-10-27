//! Text to path (prompt 013 E9–E12): one line of text in one font → SVG path data.
//!
//! harfrust (the HarfBuzz port resvg uses) shapes the line – ligatures, kerning from GPOS or
//! `kern`, complex scripts – and skrifa draws every glyph unhinted in font units. The outlines are
//! scaled to `size / unitsPerEm`, y pointing down, the origin on the baseline at the left; curves
//! stay quadratic or cubic. Characters the font has no glyph for are an error (no fallback font:
//! the path would not be the chosen font).

use super::FontCatalog;
use crate::error::{FsError, FsErrorCode};
use resvg::usvg::fontdb::Database;
use serde::Serialize;
use skrifa::MetadataProvider;
use skrifa::instance::{LocationRef, Size};
use skrifa::outline::{DrawSettings, OutlinePen};

/// Longest text (characters).
pub const MAX_TEXT_CHARS: usize = 256;
pub const MIN_SIZE: f32 = 1.0;
pub const MAX_SIZE: f32 = 4096.0;
pub const MAX_LETTER_SPACING: f32 = 1000.0;
/// Digits after the point in the path data.
const PRECISION: f32 = 100.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// The outlines of a line of text: path data, exact bounds (`None` without ink) and the advance.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPath {
    pub d: String,
    pub bbox: Option<BBox>,
    pub advance: f32,
}

fn err(code: FsErrorCode, message: impl Into<String>) -> FsError {
    FsError::new(code, message, None)
}

/// Characters that never need a glyph of their own (joiners, variation selectors …).
fn ignorable(c: char) -> bool {
    matches!(c as u32,
        0x00AD | 0x034F | 0x180B..=0x180F | 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x206F
        | 0xFE00..=0xFE0F | 0xFEFF | 0xE0000..=0xE0FFF)
}

/// Checks the arguments (design 013 E11) before anything is shaped.
fn check(text: &str, size: f32, letter_spacing: f32) -> Result<(), FsError> {
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(err(
            FsErrorCode::TooLarge,
            format!("more than {MAX_TEXT_CHARS} characters"),
        ));
    }
    if text.trim().is_empty() {
        return Err(err(FsErrorCode::InvalidText, "empty text"));
    }
    if text.chars().any(|c| c.is_control()) {
        return Err(err(
            FsErrorCode::InvalidText,
            "line breaks and control characters",
        ));
    }
    if !(MIN_SIZE..=MAX_SIZE).contains(&size) {
        return Err(err(FsErrorCode::InvalidText, "size out of range"));
    }
    if !letter_spacing.is_finite() || letter_spacing.abs() > MAX_LETTER_SPACING {
        return Err(err(FsErrorCode::InvalidText, "letter spacing out of range"));
    }
    Ok(())
}

/// Writes the outlines in output units and tracks the exact bounds.
struct Pen {
    d: String,
    scale: f32,
    dx: f32,
    dy: f32,
    cur: (f32, f32),
    min: (f32, f32),
    max: (f32, f32),
}

fn num(v: f32) -> String {
    let r = (v * PRECISION).round() / PRECISION;
    let r = if r == 0.0 { 0.0 } else { r }; // no "-0"
    let s = format!("{r:.2}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// Roots in (0, 1) of the derivative of a quadratic/cubic coordinate (extrema of the curve).
fn quad_extremum(p0: f32, p1: f32, p2: f32) -> Option<f32> {
    let den = p0 - 2.0 * p1 + p2;
    if den.abs() < 1e-9 {
        return None;
    }
    let t = (p0 - p1) / den;
    (t > 0.0 && t < 1.0).then_some(t)
}

fn cubic_extrema(p0: f32, p1: f32, p2: f32, p3: f32) -> Vec<f32> {
    // B'(t)/3 = a t² + b t + c
    let a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    let b = 2.0 * (p0 - 2.0 * p1 + p2);
    let c = p1 - p0;
    let mut out = Vec::new();
    if a.abs() < 1e-9 {
        if b.abs() > 1e-9 {
            out.push(-c / b);
        }
    } else {
        let disc = b * b - 4.0 * a * c;
        if disc >= 0.0 {
            let s = disc.sqrt();
            out.push((-b + s) / (2.0 * a));
            out.push((-b - s) / (2.0 * a));
        }
    }
    out.retain(|t| *t > 0.0 && *t < 1.0);
    out
}

impl Pen {
    fn new(scale: f32) -> Self {
        Self {
            d: String::new(),
            scale,
            dx: 0.0,
            dy: 0.0,
            cur: (0.0, 0.0),
            min: (f32::INFINITY, f32::INFINITY),
            max: (f32::NEG_INFINITY, f32::NEG_INFINITY),
        }
    }

    /// Font units of the current glyph → output units (y down).
    fn map(&self, x: f32, y: f32) -> (f32, f32) {
        ((x + self.dx) * self.scale, -(y + self.dy) * self.scale)
    }

    fn include(&mut self, p: (f32, f32)) {
        self.min = (self.min.0.min(p.0), self.min.1.min(p.1));
        self.max = (self.max.0.max(p.0), self.max.1.max(p.1));
    }

    fn cmd(&mut self, letter: char, pts: &[(f32, f32)]) {
        self.d.push(letter);
        let mut first = true;
        for p in pts {
            if !first {
                self.d.push(' ');
            }
            first = false;
            let x = num(p.0);
            let y = num(p.1);
            self.d.push_str(&x);
            if !y.starts_with('-') {
                self.d.push(' ');
            }
            self.d.push_str(&y);
        }
    }

    fn bbox(&self) -> Option<BBox> {
        (self.min.0.is_finite() && self.max.0 >= self.min.0).then_some(BBox {
            x: self.min.0,
            y: self.min.1,
            width: self.max.0 - self.min.0,
            height: self.max.1 - self.min.1,
        })
    }
}

impl OutlinePen for Pen {
    fn move_to(&mut self, x: f32, y: f32) {
        let p = self.map(x, y);
        self.include(p);
        self.cmd('M', &[p]);
        self.cur = p;
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let p = self.map(x, y);
        self.include(p);
        self.cmd('L', &[p]);
        self.cur = p;
    }

    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        let c = self.map(cx0, cy0);
        let p = self.map(x, y);
        let s = self.cur;
        self.include(p);
        let ts = [quad_extremum(s.0, c.0, p.0), quad_extremum(s.1, c.1, p.1)];
        for t in ts.into_iter().flatten() {
            let u = 1.0 - t;
            let at = |a: f32, b: f32, e: f32| u * u * a + 2.0 * u * t * b + t * t * e;
            self.include((at(s.0, c.0, p.0), at(s.1, c.1, p.1)));
        }
        self.cmd('Q', &[c, p]);
        self.cur = p;
    }

    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        let c1 = self.map(cx0, cy0);
        let c2 = self.map(cx1, cy1);
        let p = self.map(x, y);
        let s = self.cur;
        self.include(p);
        let mut ts = cubic_extrema(s.0, c1.0, c2.0, p.0);
        ts.extend(cubic_extrema(s.1, c1.1, c2.1, p.1));
        for t in ts {
            let u = 1.0 - t;
            let at = |a: f32, b: f32, c: f32, e: f32| {
                u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * e
            };
            self.include((at(s.0, c1.0, c2.0, p.0), at(s.1, c1.1, c2.1, p.1)));
        }
        self.cmd('C', &[c1, c2, p]);
        self.cur = p;
    }

    fn close(&mut self) {
        self.d.push('Z');
    }
}

/// `text` in the font `font_id` of `catalog` at `size` (output units per em) with
/// `letter_spacing` (output units added after every glyph but the last).
pub fn text_to_path(
    db: &Database,
    catalog: &FontCatalog,
    text: &str,
    font_id: &str,
    size: f32,
    letter_spacing: f32,
) -> Result<TextPath, FsError> {
    check(text, size, letter_spacing)?;
    let id = catalog
        .face(font_id)
        .ok_or_else(|| err(FsErrorCode::NotFound, format!("no font {font_id}")))?;
    db.with_face_data(id, |data, index| {
        let font = skrifa::FontRef::from_index(data, index)
            .map_err(|e| err(FsErrorCode::Io, format!("unreadable font: {e}")))?;
        let charmap = font.charmap();
        let missing: String = text
            .chars()
            .filter(|c| !c.is_whitespace() && !ignorable(*c) && charmap.map(*c).is_none())
            .collect();
        if !missing.is_empty() {
            return Err(err(
                FsErrorCode::MissingGlyphs,
                format!("no glyph for {missing:?}"),
            ));
        }
        let upem = font
            .metrics(Size::unscaled(), LocationRef::default())
            .units_per_em;
        if upem == 0 {
            return Err(err(FsErrorCode::Io, "font without units per em"));
        }
        let scale = size / f32::from(upem);
        let data = harfrust::ShaperData::new(&font);
        let shaper = data.shaper(&font).build();
        let mut buffer = harfrust::UnicodeBuffer::new();
        buffer.push_str(text);
        buffer.guess_segment_properties();
        let glyphs = shaper.shape(buffer, harfrust::ShapeOptions::new());
        let outlines = font.outline_glyphs();
        let spacing = letter_spacing / scale;
        let mut pen = Pen::new(scale);
        let mut x = 0.0f32;
        let n = glyphs.len();
        for (i, (info, pos)) in glyphs
            .glyph_infos()
            .iter()
            .zip(glyphs.glyph_positions())
            .enumerate()
        {
            if let Some(glyph) = outlines.get(skrifa::GlyphId::new(info.glyph_id)) {
                pen.dx = x + pos.x_offset as f32;
                pen.dy = pos.y_offset as f32;
                glyph
                    .draw(
                        DrawSettings::unhinted(Size::unscaled(), LocationRef::default()),
                        &mut pen,
                    )
                    .map_err(|e| err(FsErrorCode::Io, format!("glyph outline: {e}")))?;
            }
            x += pos.x_advance as f32;
            if i + 1 < n {
                x += spacing;
            }
        }
        Ok(TextPath {
            bbox: pen.bbox(),
            d: pen.d,
            advance: x * scale,
        })
    })
    .unwrap_or_else(|| Err(err(FsErrorCode::NotFound, format!("no font {font_id}"))))
}

#[cfg(test)]
mod tests {
    use super::super::test_font;
    use super::*;

    fn run(text: &str, size: f32, ls: f32) -> Result<TextPath, FsError> {
        let db = test_font::db();
        let cat = FontCatalog::build(&db);
        text_to_path(&db, &cat, text, "Caladea-Regular", size, ls)
    }

    #[test]
    fn a_word_becomes_path_data_with_exact_bounds() {
        let p = run("Hello", 100.0, 0.0).unwrap();
        assert!(p.d.starts_with('M'), "{}", p.d);
        assert!(p.d.contains('Z'));
        assert!(p.d.contains('Q') || p.d.contains('C'));
        let b = p.bbox.unwrap();
        // cap height above the baseline (y down: negative), nothing far below it
        assert!(b.y < -50.0 && b.y > -100.0, "{b:?}");
        assert!(b.y + b.height <= 3.0, "{b:?}");
        assert!(b.x >= 0.0 && b.x < 15.0, "{b:?}");
        assert!(b.width > 150.0 && b.width < 300.0, "{b:?}");
        assert!(p.advance >= b.x + b.width);
    }

    #[test]
    fn size_scales_the_outlines() {
        let a = run("H", 100.0, 0.0).unwrap().bbox.unwrap();
        let b = run("H", 200.0, 0.0).unwrap().bbox.unwrap();
        assert!((b.height - 2.0 * a.height).abs() < 0.05);
        assert!((b.width - 2.0 * a.width).abs() < 0.05);
    }

    #[test]
    fn kerning_pulls_pairs_together() {
        let av = run("AV", 1000.0, 0.0).unwrap().advance;
        let a = run("A", 1000.0, 0.0).unwrap().advance;
        let v = run("V", 1000.0, 0.0).unwrap().advance;
        assert!(av < a + v - 1.0, "AV {av} vs {}", a + v);
    }

    #[test]
    fn letter_spacing_goes_between_glyphs() {
        let plain = run("HHH", 100.0, 0.0).unwrap();
        let wide = run("HHH", 100.0, 10.0).unwrap();
        assert!((wide.advance - plain.advance - 20.0).abs() < 0.01);
    }

    #[test]
    fn umlauts_and_sharp_s_have_glyphs() {
        let p = run("ÄÖÜäöüß", 100.0, 0.0).unwrap();
        // the dots of Ä reach above the cap height of H
        let h = run("H", 100.0, 0.0).unwrap().bbox.unwrap();
        assert!(p.bbox.unwrap().y < h.y - 5.0);
    }

    #[test]
    fn emoji_are_missing_glyphs() {
        let e = run("Hi 😀", 100.0, 0.0).unwrap_err();
        assert_eq!(e.code, FsErrorCode::MissingGlyphs);
        assert!(e.message.contains('😀'));
        // a joiner or variation selector alone is no missing glyph
        assert!(run("A\u{200D}B\u{FE0F}", 100.0, 0.0).is_ok());
    }

    #[test]
    fn empty_and_blank_text_is_invalid() {
        for t in ["", "   ", "\u{3000}"] {
            assert_eq!(
                run(t, 100.0, 0.0).unwrap_err().code,
                FsErrorCode::InvalidText
            );
        }
        assert_eq!(
            run("a\nb", 100.0, 0.0).unwrap_err().code,
            FsErrorCode::InvalidText
        );
    }

    #[test]
    fn spaces_inside_are_fine() {
        let a = run("A B", 100.0, 0.0).unwrap();
        let b = run("AB", 100.0, 0.0).unwrap();
        assert!(a.advance > b.advance + 10.0);
    }

    #[test]
    fn limits_are_checked() {
        let long = "a".repeat(MAX_TEXT_CHARS + 1);
        assert_eq!(
            run(&long, 100.0, 0.0).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert!(run(&"a".repeat(MAX_TEXT_CHARS), 10.0, 0.0).is_ok());
        for (size, ls) in [(0.5, 0.0), (5000.0, 0.0), (100.0, 2000.0), (f32::NAN, 0.0)] {
            assert_eq!(
                run("a", size, ls).unwrap_err().code,
                FsErrorCode::InvalidText,
                "{size} {ls}"
            );
        }
    }

    #[test]
    fn an_unknown_font_is_not_found() {
        let db = test_font::db();
        let cat = FontCatalog::build(&db);
        let e = text_to_path(&db, &cat, "a", "Nope-Regular", 10.0, 0.0).unwrap_err();
        assert_eq!(e.code, FsErrorCode::NotFound);
    }

    #[test]
    fn numbers_are_short() {
        assert_eq!(num(1.0), "1");
        assert_eq!(num(1.256), "1.26");
        assert_eq!(num(-0.001), "0");
        assert_eq!(num(-2.5), "-2.5");
    }

    #[test]
    fn curve_extrema_widen_the_bounds() {
        let mut pen = Pen::new(1.0);
        pen.move_to(0.0, 0.0);
        pen.quad_to(5.0, -10.0, 10.0, 0.0); // y up in font units → bulges to +5 (down)
        let b = pen.bbox().unwrap();
        assert!((b.height - 5.0).abs() < 1e-4, "{b:?}");
        let mut pen = Pen::new(1.0);
        pen.move_to(0.0, 0.0);
        pen.curve_to(0.0, 10.0, 10.0, 10.0, 10.0, 0.0);
        let b = pen.bbox().unwrap();
        assert!((b.height - 7.5).abs() < 1e-4, "{b:?}");
    }
}
