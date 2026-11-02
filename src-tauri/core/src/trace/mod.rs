//! Tracing a raster image into an SVG layer (prompt 087).
//!
//! - Stage A (E5–E7): colour regions (visioncortex, the engine of vtracer), stacked bottom first,
//!   each connected part outlined as curves, straight edges or pixel steps – or the dark parts of
//!   a black-and-white image.
//! - Stage B (E8–E11): bands of a gradient joined into one region with a `linearGradient`,
//!   rectangles, rounded rectangles, ellipses and circles recognised as such, equal shapes made
//!   equal and near colours one colour – as a user would draw it by hand.
//!
//! The answer is one `<svg>` in output units (image pixels × `scale`) for a new layer; the
//! frontend cleans it like any imported SVG.

pub mod gradient;
pub mod outline;
pub mod raster;
pub mod regions;
pub mod shapes;

use crate::error::{FsError, FsErrorCode};
use gradient::{Gradient, gradient_of, mean_color};
use outline::{CurveSettings, ShapeInput, num, parts, path_data};
use raster::Rgba;
use regions::{
    ClusterSettings, Region, color_regions, drop_background, join_gradients, mono_regions,
};
use serde::{Deserialize, Serialize};
use shapes::{Primitive, harmonize, harmonize_colors};
use std::fmt::Write;
use std::time::Instant;
use visioncortex::PathSimplifyMode;

/// Images are traced at most this large (longer side, pixels); larger ones are scaled down first.
pub const WORK_SIDE: u32 = 2048;
/// Most elements of one trace – more is noise (raise "smallest area").
pub const MAX_ELEMENTS: usize = 20_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorMode {
    Color,
    Mono,
}

/// Outline style (E6): smooth curves, straight edges, exact pixel steps (pixel art).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CurveMode {
    Spline,
    Polygon,
    Pixel,
}

/// What and how to trace (DTO `TraceOptions`, camelCase; every field optional – defaults are
/// vtracer's, design 087 E4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TraceOptions {
    pub mode: ColorMode,
    pub curves: CurveMode,
    /// Significant bits per channel, 1–8.
    pub color_precision: u8,
    /// Colour difference between stacked regions, 0–255.
    pub layer_difference: u8,
    /// Regions smaller than `speckle × speckle` pixels are dropped, 0–128.
    pub speckle: u32,
    /// Degrees: sharper turns are corners (0–180).
    pub corner_threshold: f64,
    /// Shortest curve segment (pixels, 3.5–10).
    pub length_threshold: f64,
    /// Degrees: splines are split at turns over this (0–180).
    pub splice_threshold: f64,
    /// Black and white: luminance below this is black.
    pub threshold: u8,
    /// Stage B: rectangles, rounded rectangles, ellipses, circles.
    pub shapes: bool,
    /// Stage B: bands of a gradient joined, `linearGradient` fills.
    pub gradients: bool,
    /// Stage B: equal shapes equal, shared edges, near colours one colour.
    pub harmonize: bool,
    /// Leave out the bottom region when it fills the image.
    pub drop_background: bool,
    /// Output units per image pixel (0.01–64).
    pub scale: f64,
}

impl Default for TraceOptions {
    fn default() -> Self {
        Self {
            mode: ColorMode::Color,
            curves: CurveMode::Spline,
            color_precision: 6,
            layer_difference: 16,
            speckle: 4,
            corner_threshold: 60.0,
            length_threshold: 4.0,
            splice_threshold: 45.0,
            threshold: 128,
            shapes: false,
            gradients: false,
            harmonize: false,
            drop_background: false,
            scale: 1.0,
        }
    }
}

/// What came out (for the dialog's summary and the AI).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceStats {
    pub elements: usize,
    pub paths: usize,
    pub rects: usize,
    pub ellipses: usize,
    pub gradients: usize,
    pub colors: usize,
    pub ms: u64,
}

/// The trace: SVG markup of the new layer, its size in output units, the summary.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceResult {
    pub svg: String,
    pub width: f64,
    pub height: f64,
    pub stats: TraceStats,
}

fn bad(msg: &str) -> FsError {
    FsError::new(FsErrorCode::InvalidRequest, msg.to_owned(), None)
}

impl TraceOptions {
    /// Ranges of every field (`invalid_request` otherwise).
    pub fn check(&self) -> Result<(), FsError> {
        if !(1..=8).contains(&self.color_precision) {
            return Err(bad("colorPrecision 1–8"));
        }
        if self.speckle > 128 {
            return Err(bad("speckle 0–128"));
        }
        let angle = |v: f64| v.is_finite() && (0.0..=180.0).contains(&v);
        if !angle(self.corner_threshold) || !angle(self.splice_threshold) {
            return Err(bad("thresholds 0–180"));
        }
        if !(self.length_threshold.is_finite() && (3.5..=10.0).contains(&self.length_threshold)) {
            return Err(bad("lengthThreshold 3.5–10"));
        }
        if !(self.scale.is_finite() && (0.01..=64.0).contains(&self.scale)) {
            return Err(bad("scale 0.01–64"));
        }
        Ok(())
    }
}

/// A paint of an element.
#[derive(Clone, Copy)]
enum Paint {
    Flat([u8; 3]),
    Gradient(usize),
}

enum Geometry {
    Path { d: String, holes: bool },
    Shape(Primitive),
}

struct Element {
    geometry: Geometry,
    paint: Paint,
    /// Index of the region (for colour harmony).
    region: usize,
}

fn hex(c: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

/// Traces a PNG data URL (`data:image/png;base64,…`).
pub fn trace_data_url(url: &str, opts: &TraceOptions) -> Result<TraceResult, FsError> {
    let bytes = crate::icon::save::decode_png_data_url(url)
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidImage, "not a PNG data URL", None))?;
    trace_png(&bytes, opts)
}

/// Traces a PNG file.
pub fn trace_png(png: &[u8], opts: &TraceOptions) -> Result<TraceResult, FsError> {
    opts.check()?;
    let image = raster::decode_png(png)?;
    trace(&image, opts)
}

/// Traces an image (E5–E11).
pub fn trace(image: &Rgba, opts: &TraceOptions) -> Result<TraceResult, FsError> {
    opts.check()?;
    let started = Instant::now();
    let work = raster::fit(image, WORK_SIDE);
    // output units per work pixel
    let k = opts.scale * image.width as f64 / work.width as f64;
    let min_area = (opts.speckle * opts.speckle) as usize;
    let mut regions: Vec<Region> = match opts.mode {
        ColorMode::Color => color_regions(
            &work,
            ClusterSettings {
                precision_loss: 8 - opts.color_precision as i32,
                layer_difference: opts.layer_difference as i32,
                min_area,
            },
        )?,
        ColorMode::Mono => mono_regions(&work, opts.threshold, min_area),
    };
    let colored = opts.mode == ColorMode::Color;
    if colored && opts.gradients {
        regions = join_gradients(regions);
    }
    if opts.drop_background {
        regions = drop_background(regions, work.width, work.height);
    }
    let curves = CurveSettings {
        mode: match opts.curves {
            CurveMode::Spline => PathSimplifyMode::Spline,
            CurveMode::Polygon => PathSimplifyMode::Polygon,
            CurveMode::Pixel => PathSimplifyMode::None,
        },
        corner_threshold: opts.corner_threshold,
        length_threshold: opts.length_threshold,
        splice_threshold: opts.splice_threshold,
        max_iterations: 10,
    };
    let norm = work.width.max(work.height) as f64;
    let mut gradients: Vec<Gradient> = Vec::new();
    let mut elements: Vec<Element> = Vec::new();
    for (ri, region) in regions.iter().enumerate() {
        let paint = if colored && opts.gradients {
            let r = region.rect;
            let corners = [
                (r.left as f64 / norm, r.top as f64 / norm),
                (r.right as f64 / norm, r.bottom as f64 / norm),
            ];
            // small regions (letters, dots) are flat – a user gives them one colour
            let found = if region.visible.count() >= MIN_GRADIENT_AREA {
                gradient_of(&region.visible, corners, norm)
            } else {
                None
            };
            match found {
                Some(g) => {
                    gradients.push(g);
                    Paint::Gradient(gradients.len() - 1)
                }
                None => Paint::Flat(mean_color(&region.visible)),
            }
        } else {
            Paint::Flat(region.color)
        };
        let input = ShapeInput { img: &work };
        let shapes = opts.shapes.then_some(&input);
        for part in parts(region, work.width, &curves, shapes) {
            let geometry = match part.shape {
                Some(s) => Geometry::Shape(s),
                None => {
                    let d = path_data(&part.path, k);
                    if d.is_empty() {
                        continue;
                    }
                    Geometry::Path {
                        holes: part.path.paths.len() > 1,
                        d,
                    }
                }
            };
            elements.push(Element {
                geometry,
                paint,
                region: ri,
            });
            if elements.len() > MAX_ELEMENTS {
                return Err(FsError::new(
                    FsErrorCode::TooLarge,
                    format!("more than {MAX_ELEMENTS} shapes"),
                    None,
                ));
            }
        }
    }
    if opts.harmonize {
        let mut prims: Vec<&mut Primitive> = elements
            .iter_mut()
            .filter_map(|e| match &mut e.geometry {
                Geometry::Shape(p) => Some(p),
                Geometry::Path { .. } => None,
            })
            .collect();
        harmonize(&mut prims);
        harmonize_flat_colors(&mut elements, &regions);
    }
    let width = image.width as f64 * opts.scale;
    let height = image.height as f64 * opts.scale;
    let (svg, mut stats) = write_svg(&elements, &gradients, width, height, k);
    stats.ms = started.elapsed().as_millis() as u64;
    Ok(TraceResult {
        svg,
        width,
        height,
        stats,
    })
}

/// Smallest region (visible pixels) that gets a gradient fill.
pub const MIN_GRADIENT_AREA: f64 = 400.0;

/// Flat colours at most this far apart (per channel) become one (E11).
pub const COLOR_TOLERANCE: u8 = 6;

fn harmonize_flat_colors(elements: &mut [Element], regions: &[Region]) {
    let flat: Vec<(usize, [u8; 3], f64)> = elements
        .iter()
        .enumerate()
        .filter_map(|(i, e)| match e.paint {
            Paint::Flat(c) => Some((i, c, regions[e.region].visible.count())),
            Paint::Gradient(_) => None,
        })
        .collect();
    let new = harmonize_colors(
        &flat.iter().map(|&(_, c, n)| (c, n)).collect::<Vec<_>>(),
        COLOR_TOLERANCE,
    );
    for ((i, _, _), c) in flat.into_iter().zip(new) {
        elements[i].paint = Paint::Flat(c);
    }
}

fn write_svg(
    elements: &[Element],
    gradients: &[Gradient],
    width: f64,
    height: f64,
    k: f64,
) -> (String, TraceStats) {
    let mut s = String::new();
    let mut stats = TraceStats::default();
    let (w, h) = (num(width), num(height));
    let _ = write!(
        s,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">"#
    );
    // only the gradients an element uses
    let mut used = vec![false; gradients.len()];
    for e in elements {
        if let Paint::Gradient(g) = e.paint {
            used[g] = true;
        }
    }
    let mut ids = vec![0usize; gradients.len()];
    if used.iter().any(|&u| u) {
        s.push_str("<defs>");
        let mut n = 0;
        for (i, g) in gradients.iter().enumerate() {
            if !used[i] {
                continue;
            }
            n += 1;
            ids[i] = n;
            let _ = write!(
                s,
                r#"<linearGradient id="trace-gradient-{n}" gradientUnits="userSpaceOnUse" x1="{}" y1="{}" x2="{}" y2="{}"><stop offset="0" stop-color="{}"/><stop offset="1" stop-color="{}"/></linearGradient>"#,
                num(g.p1.0 * k),
                num(g.p1.1 * k),
                num(g.p2.0 * k),
                num(g.p2.1 * k),
                hex(g.c1),
                hex(g.c2)
            );
        }
        stats.gradients = n;
        s.push_str("</defs>");
    }
    let mut colors = std::collections::BTreeSet::new();
    for e in elements {
        let fill = match e.paint {
            Paint::Flat(c) => {
                colors.insert(c);
                hex(c)
            }
            Paint::Gradient(g) => format!("url(#trace-gradient-{})", ids[g]),
        };
        match &e.geometry {
            Geometry::Path { d, holes } => {
                stats.paths += 1;
                let rule = if *holes {
                    r#" fill-rule="evenodd""#
                } else {
                    ""
                };
                let _ = write!(s, r#"<path d="{d}" fill="{fill}"{rule}/>"#);
            }
            Geometry::Shape(Primitive::Rect { x, y, w, h, r }) => {
                stats.rects += 1;
                let _ = write!(
                    s,
                    r#"<rect x="{}" y="{}" width="{}" height="{}""#,
                    num(x * k),
                    num(y * k),
                    num(w * k),
                    num(h * k)
                );
                if *r > 0.0 {
                    let _ = write!(s, r#" rx="{}""#, num(r * k));
                }
                let _ = write!(s, r#" fill="{fill}"/>"#);
            }
            Geometry::Shape(Primitive::Ellipse { cx, cy, rx, ry }) => {
                stats.ellipses += 1;
                if (rx - ry).abs() < 0.75 {
                    let _ = write!(
                        s,
                        r#"<circle cx="{}" cy="{}" r="{}" fill="{fill}"/>"#,
                        num(cx * k),
                        num(cy * k),
                        num((rx + ry) / 2.0 * k)
                    );
                } else {
                    let _ = write!(
                        s,
                        r#"<ellipse cx="{}" cy="{}" rx="{}" ry="{}" fill="{fill}"/>"#,
                        num(cx * k),
                        num(cy * k),
                        num(rx * k),
                        num(ry * k)
                    );
                }
            }
        }
    }
    s.push_str("</svg>");
    stats.elements = elements.len();
    stats.colors = colors.len();
    (s, stats)
}

#[cfg(test)]
mod tests;
