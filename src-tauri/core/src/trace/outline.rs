//! Outlines of regions (prompt 087 E6): each connected part of a region traced by visioncortex as
//! curves (spline), straight edges (polygon) or exact pixel steps, and – for stage B – handed to
//! shape recognition as a mask. Path data is written here in output units.

use super::raster::Rgba;
use super::regions::Region;
use super::shapes::{Mask, Primitive, recognise, refine_edges};
use std::fmt::Write;
use visioncortex::clusters::Cluster as BinaryCluster;
use visioncortex::{BinaryImage, CompoundPath, CompoundPathElement, PathSimplifyMode, PointI32};

/// How outlines are traced (vtracer's parameters, angles in degrees).
#[derive(Debug, Clone, Copy)]
pub struct CurveSettings {
    pub mode: PathSimplifyMode,
    pub corner_threshold: f64,
    pub length_threshold: f64,
    pub splice_threshold: f64,
    pub max_iterations: usize,
}

/// One connected part of a region.
pub struct Part {
    pub path: CompoundPath,
    /// The recognised shape (stage B), if asked for and found.
    pub shape: Option<Primitive>,
}

/// Recognising shapes (stage B): the image (for sub-pixel edges).
pub struct ShapeInput<'a> {
    pub img: &'a Rgba,
}

/// The connected parts of a region, each with its outline (and shape with `shapes`).
pub fn parts(
    region: &Region,
    width: u32,
    curves: &CurveSettings,
    shapes: Option<&ShapeInput>,
) -> Vec<Part> {
    let rect = region.rect;
    let (rw, rh) = (rect.width() as usize, rect.height() as usize);
    let mut img = BinaryImage::new_w_h(rw, rh);
    for &i in &region.pixels {
        let x = (i % width) as i32 - rect.left;
        let y = (i / width) as i32 - rect.top;
        img.set_pixel(x as usize, y as usize, true);
    }
    img.to_clusters(false)
        .iter()
        .map(|c| part(c, rect.left, rect.top, curves, shapes))
        .collect()
}

fn part(
    c: &BinaryCluster,
    left: i32,
    top: i32,
    curves: &CurveSettings,
    shapes: Option<&ShapeInput>,
) -> Part {
    let image = c.to_binary_image();
    let offset = PointI32 {
        x: left + c.rect.left,
        y: top + c.rect.top,
    };
    let path = BinaryCluster::image_to_compound_path(
        &offset,
        &image,
        curves.mode,
        curves.corner_threshold.to_radians(),
        curves.length_threshold,
        curves.max_iterations,
        curves.splice_threshold.to_radians(),
    );
    let shape = shapes.and_then(|input| {
        let inside = |x: usize, y: usize| image.get_pixel(x, y);
        let found = recognise(
            &Mask {
                left: offset.x,
                top: offset.y,
                width: image.width,
                height: image.height,
                inside: &inside,
            },
            c.size(),
        )?;
        Some(refine_edges(found, input.img))
    });
    Part { path, shape }
}

/// A number with at most two decimals, no trailing zeros, no `-0`.
pub fn num(v: f64) -> String {
    let r = (v * 100.0).round() / 100.0;
    let r = if r == 0.0 { 0.0 } else { r };
    let s = format!("{r:.2}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    s.to_owned()
}

/// Path data of a compound path, every coordinate times `k`.
pub fn path_data(path: &CompoundPath, k: f64) -> String {
    let mut d = String::new();
    let p = |d: &mut String, cmd: char, x: f64, y: f64| {
        let _ = write!(d, "{cmd}{} {}", num(x * k), num(y * k));
    };
    for el in &path.paths {
        match el {
            CompoundPathElement::PathI32(path) => {
                let pts = &path.path;
                // closed paths repeat the first point at the end
                let n = if pts.len() > 1 && pts[0] == pts[pts.len() - 1] {
                    pts.len() - 1
                } else {
                    pts.len()
                };
                for (i, q) in pts.iter().take(n).enumerate() {
                    p(
                        &mut d,
                        if i == 0 { 'M' } else { 'L' },
                        q.x as f64,
                        q.y as f64,
                    );
                }
            }
            CompoundPathElement::PathF64(path) => {
                let pts = &path.path;
                let n = if pts.len() > 1 && pts[0] == pts[pts.len() - 1] {
                    pts.len() - 1
                } else {
                    pts.len()
                };
                for (i, q) in pts.iter().take(n).enumerate() {
                    p(&mut d, if i == 0 { 'M' } else { 'L' }, q.x, q.y);
                }
            }
            CompoundPathElement::Spline(s) => {
                let pts = &s.points;
                if pts.is_empty() {
                    continue;
                }
                p(&mut d, 'M', pts[0].x, pts[0].y);
                for c in pts[1..].chunks(3) {
                    if c.len() < 3 {
                        break;
                    }
                    let _ = write!(
                        d,
                        "C{} {} {} {} {} {}",
                        num(c[0].x * k),
                        num(c[0].y * k),
                        num(c[1].x * k),
                        num(c[1].y * k),
                        num(c[2].x * k),
                        num(c[2].y * k)
                    );
                }
            }
        }
        d.push('Z');
    }
    d
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trace::gradient::ColorStats;
    use visioncortex::BoundingRect;

    fn square_region(width: u32, x0: u32, y0: u32, side: u32) -> Region {
        let mut pixels = Vec::new();
        let mut rect = BoundingRect::default();
        for y in y0..y0 + side {
            for x in x0..x0 + side {
                pixels.push(y * width + x);
                rect.add_x_y(x as i32, y as i32);
            }
        }
        Region {
            pixels,
            rect,
            color: [0, 0, 0],
            visible: ColorStats::default(),
            parent: None,
        }
    }

    fn polygon() -> CurveSettings {
        CurveSettings {
            mode: PathSimplifyMode::Polygon,
            corner_threshold: 60.0,
            length_threshold: 4.0,
            splice_threshold: 45.0,
            max_iterations: 10,
        }
    }

    #[test]
    fn numbers_are_short() {
        assert_eq!(num(1.0), "1");
        assert_eq!(num(1.256), "1.26");
        assert_eq!(num(-0.001), "0");
        assert_eq!(num(10.50), "10.5");
    }

    #[test]
    fn a_square_is_one_part_with_a_closed_outline_and_a_shape() {
        let region = square_region(50, 10, 20, 12);
        let img = Rgba::new(50, 50);
        let input = ShapeInput { img: &img };
        let parts = parts(&region, 50, &polygon(), Some(&input));
        assert_eq!(parts.len(), 1);
        let d = path_data(&parts[0].path, 2.0);
        assert!(d.starts_with('M') && d.ends_with('Z'), "{d}");
        // corners at pixel edges, scaled by 2
        for corner in ["20 40", "44 40", "44 64", "20 64"] {
            assert!(d.contains(corner), "{corner} in {d}");
        }
        assert_eq!(
            parts[0].shape,
            Some(Primitive::Rect {
                x: 10.0,
                y: 20.0,
                w: 12.0,
                h: 12.0,
                r: 0.0
            })
        );
    }

    #[test]
    fn separate_pieces_are_separate_parts() {
        let mut region = square_region(50, 0, 0, 5);
        let other = square_region(50, 20, 20, 5);
        region.pixels.extend(other.pixels);
        region.rect.merge(other.rect);
        assert_eq!(parts(&region, 50, &polygon(), None).len(), 2);
    }

    #[test]
    fn splines_are_cubic_curves() {
        let region = square_region(50, 5, 5, 30);
        let mut curves = polygon();
        curves.mode = PathSimplifyMode::Spline;
        let d = path_data(&parts(&region, 50, &curves, None)[0].path, 1.0);
        assert!(d.contains('C') && d.ends_with('Z'), "{d}");
    }
}
