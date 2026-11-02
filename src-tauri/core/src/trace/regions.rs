//! Regions of an image (prompt 087 E5–E8): colour clusters of visioncortex stacked like vtracer's
//! "stacked" mode (each region covers the regions painted on top of it, bottom first), or the
//! dark parts of a black-and-white image; with stage B the bands of a gradient joined into one
//! region whose colours one plane explains.
//!
//! The colour pipeline follows vtracer `src/converter.rs` (visioncortex, MIT OR Apache-2.0):
//! keyed transparency, `Runner` with the same parameters, output clusters in reverse.

use super::gradient::ColorStats;
use super::raster::Rgba;
use crate::error::{FsError, FsErrorCode};
use visioncortex::color_clusters::{HIERARCHICAL_MAX, KeyingAction, Runner, RunnerConfig};
use visioncortex::{BinaryImage, BoundingRect, Color, ColorImage};

/// Pixels with less alpha count as transparent.
pub const ALPHA_MIN: u8 = 128;

/// One region in paint order.
#[derive(Debug, Clone)]
pub struct Region {
    /// Its pixels (`y · width + x`), including those of the regions painted on top of it.
    pub pixels: Vec<u32>,
    pub rect: BoundingRect,
    /// The tracer's colour (vtracer's residue colour).
    pub color: [u8; 3],
    /// The original colours of the pixels it shows (not covered by later regions).
    pub visible: ColorStats,
    /// The region it is painted on (the top-most one under it), if it lies entirely on it.
    pub parent: Option<usize>,
}

/// Normalised position of a pixel (centre, divided by the longer side).
pub fn norm_pos(img: &Rgba, i: u32) -> (f64, f64) {
    let n = img.width.max(img.height) as f64;
    let x = (i % img.width) as f64 + 0.5;
    let y = (i / img.width) as f64 + 0.5;
    (x / n, y / n)
}

fn rgb(img: &Rgba, i: u32) -> [u8; 3] {
    let k = i as usize * 4;
    [img.data[k], img.data[k + 1], img.data[k + 2]]
}

fn opaque(img: &Rgba, i: u32) -> bool {
    img.data[i as usize * 4 + 3] >= ALPHA_MIN
}

/// A colour no opaque pixel has (the key of transparent pixels) – deterministic.
fn key_color(img: &Rgba) -> Result<[u8; 3], FsError> {
    // one bit per colour (2 MiB)
    let mut used = vec![0u64; (1 << 24) / 64];
    let index = |c: [u8; 3]| ((c[0] as usize) << 16) | ((c[1] as usize) << 8) | c[2] as usize;
    for i in 0..img.width * img.height {
        if opaque(img, i) {
            let c = index(rgb(img, i));
            used[c / 64] |= 1 << (c % 64);
        }
    }
    let free = |c: usize| used[c / 64] & (1 << (c % 64)) == 0;
    let special = [
        0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0x7f00ff, 0x00ff7f,
    ];
    let mut seed: u32 = 0x9e37_79b9;
    let lcg = std::iter::from_fn(|| {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        Some((seed >> 8) as usize & 0xff_ffff)
    });
    special
        .into_iter()
        .chain(lcg.take(4096))
        .find(|&c| free(c) && c != 0)
        .map(|c| [(c >> 16) as u8, (c >> 8) as u8, c as u8])
        .ok_or_else(|| FsError::new(FsErrorCode::InvalidImage, "no free key colour", None))
}

/// Settings of the colour clustering (vtracer's names).
#[derive(Debug, Clone, Copy)]
pub struct ClusterSettings {
    /// Bits of colour dropped when comparing (8 − colour precision).
    pub precision_loss: i32,
    pub layer_difference: i32,
    /// Smallest region (pixels).
    pub min_area: usize,
}

/// The colour regions of `img`, bottom first.
pub fn color_regions(img: &Rgba, s: ClusterSettings) -> Result<Vec<Region>, FsError> {
    let total = img.width * img.height;
    let keyed = (0..total).any(|i| !opaque(img, i));
    let key = if keyed { Some(key_color(img)?) } else { None };
    let mut pixels = Vec::with_capacity(total as usize * 4);
    for i in 0..total {
        let c = match key {
            Some(k) if !opaque(img, i) => k,
            _ => rgb(img, i),
        };
        pixels.extend_from_slice(&[c[0], c[1], c[2], 255]);
    }
    let image = ColorImage {
        pixels,
        width: img.width as usize,
        height: img.height as usize,
    };
    let key_color = key.map_or(Color::default(), |k| Color::new(k[0], k[1], k[2]));
    let runner = Runner::new(
        RunnerConfig {
            diagonal: s.layer_difference == 0,
            hierarchical: HIERARCHICAL_MAX,
            batch_size: 25600,
            good_min_area: s.min_area,
            good_max_area: total as usize,
            is_same_color_a: s.precision_loss,
            is_same_color_b: 1,
            deepen_diff: s.layer_difference,
            hollow_neighbours: 1,
            key_color,
            keying_action: KeyingAction::Discard,
        },
        image,
    );
    let clusters = runner.run();
    let view = clusters.view();
    let mut out: Vec<Region> = view
        .clusters_output
        .iter()
        .rev()
        .map(|&ci| {
            let c = view.get_cluster(ci);
            let col = c.residue_color();
            Region {
                pixels: c.indices.clone(),
                rect: c.rect,
                color: [col.r, col.g, col.b],
                visible: ColorStats::default(),
                parent: None,
            }
        })
        .filter(|r| !r.pixels.is_empty())
        .collect();
    // keyed pixels belong to no region
    if keyed {
        for r in &mut out {
            r.pixels.retain(|&i| opaque(img, i));
        }
        out.retain(|r| !r.pixels.is_empty());
    }
    link(img, &mut out);
    Ok(out)
}

/// The dark parts (luminance below `threshold`) of a black-and-white trace, in black.
pub fn mono_regions(img: &Rgba, threshold: u8, min_area: usize) -> Vec<Region> {
    let (w, h) = (img.width as usize, img.height as usize);
    let mut bin = BinaryImage::new_w_h(w, h);
    for i in 0..(w * h) as u32 {
        let [r, g, b] = rgb(img, i);
        let lum = 0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64;
        if opaque(img, i) && lum < threshold as f64 {
            bin.set_pixel(i as usize % w, i as usize / w, true);
        }
    }
    let clusters = bin.to_clusters(false);
    let mut out: Vec<Region> = clusters
        .iter()
        .filter(|c| c.size() >= min_area.max(1))
        .map(|c| Region {
            pixels: c
                .points
                .iter()
                .map(|p| (p.y as u32) * img.width + p.x as u32)
                .collect(),
            rect: c.rect,
            color: [0, 0, 0],
            visible: ColorStats::default(),
            parent: None,
        })
        .collect();
    link(img, &mut out);
    out
}

/// Parents and the visible colour statistics, from painting the regions in order.
fn link(img: &Rgba, regions: &mut [Region]) {
    const NONE: u32 = u32::MAX;
    let mut owner = vec![NONE; (img.width * img.height) as usize];
    for (k, r) in regions.iter_mut().enumerate() {
        let below = owner[r.pixels[0] as usize];
        let nested = below != NONE && r.pixels.iter().all(|&i| owner[i as usize] == below);
        r.parent = nested.then_some(below as usize);
        for &i in &r.pixels {
            owner[i as usize] = k as u32;
        }
    }
    for (i, &o) in owner.iter().enumerate() {
        if o != NONE {
            let (x, y) = norm_pos(img, i as u32);
            regions[o as usize].visible.add(x, y, rgb(img, i as u32));
        }
    }
}

/// Largest error (0–255) of the plane over two joined bands, and of its mean on the upper one.
pub const JOIN_RMS: f64 = 6.0;
pub const JOIN_MEAN: f64 = 8.0;

/// Stage B (E8): a region joins the region it lies on when one plane explains the colours of
/// both – the bands a colour quantiser cuts a gradient into become one region again. Top-most
/// first, so chains of bands collapse. Answers the regions left, in paint order.
pub fn join_gradients(mut regions: Vec<Region>) -> Vec<Region> {
    let n = regions.len();
    let mut alive = vec![true; n];
    for k in (0..n).rev() {
        let Some(p) = regions[k].parent else { continue };
        let mut both = regions[p].visible;
        both.merge(&regions[k].visible);
        let Some(model) = both.fit() else { continue };
        if model.rms > JOIN_RMS {
            continue;
        }
        let (cx, cy) = regions[k].visible.centre();
        let predicted = model.at(cx, cy);
        let mean = regions[k].visible.mean();
        if (0..3).any(|c| (predicted[c] - mean[c]).abs() > JOIN_MEAN) {
            continue;
        }
        regions[p].visible = both;
        alive[k] = false;
        // the regions on top of the joined one now lie on its parent
        for r in regions.iter_mut().skip(k + 1) {
            if r.parent == Some(k) {
                r.parent = Some(p);
            }
        }
    }
    let mut index = vec![usize::MAX; n];
    let mut out = Vec::new();
    for (k, r) in regions.into_iter().enumerate() {
        if alive[k] {
            index[k] = out.len();
            out.push(r);
        }
    }
    for r in &mut out {
        r.parent = r.parent.map(|p| index[p]).filter(|&p| p != usize::MAX);
    }
    out
}

/// Leaves out the bottom region when it touches all four edges of the image (the background a
/// `.icon` brings itself, E7).
pub fn drop_background(mut regions: Vec<Region>, width: u32, height: u32) -> Vec<Region> {
    let Some(first) = regions.first() else {
        return regions;
    };
    let r = first.rect;
    let touches = r.left <= 0 && r.top <= 0 && r.right >= width as i32 && r.bottom >= height as i32;
    if touches {
        regions.remove(0);
        for reg in &mut regions {
            reg.parent = match reg.parent {
                Some(0) | None => None,
                Some(p) => Some(p - 1),
            };
        }
    }
    regions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: u32, h: u32, c: [u8; 4]) -> Rgba {
        let mut img = Rgba::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.set(x, y, c);
            }
        }
        img
    }

    fn settings() -> ClusterSettings {
        ClusterSettings {
            precision_loss: 2,
            layer_difference: 16,
            min_area: 16,
        }
    }

    #[test]
    fn a_square_on_a_background_is_two_stacked_regions() {
        let mut img = solid(40, 40, [255, 255, 255, 255]);
        for y in 10..30 {
            for x in 10..30 {
                img.set(x, y, [200, 30, 30, 255]);
            }
        }
        let regions = color_regions(&img, settings()).unwrap();
        assert_eq!(regions.len(), 2, "{regions:?}");
        assert_eq!(regions[0].color, [255, 255, 255]);
        // the background covers the square too (stacked)
        assert_eq!(regions[0].pixels.len(), 1600);
        assert_eq!(regions[1].color, [200, 30, 30]);
        assert_eq!(regions[1].pixels.len(), 400);
        assert_eq!(regions[1].parent, Some(0));
        assert_eq!(regions[0].visible.count(), 1200.0);
        assert_eq!(regions[1].visible.count(), 400.0);
        let rest = drop_background(regions, 40, 40);
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].parent, None);
    }

    #[test]
    fn transparent_pixels_belong_to_no_region() {
        let mut img = solid(30, 30, [0, 0, 0, 0]);
        for y in 5..25 {
            for x in 5..25 {
                img.set(x, y, [10, 120, 250, 255]);
            }
        }
        let regions = color_regions(&img, settings()).unwrap();
        assert_eq!(regions.len(), 1, "{regions:?}");
        assert_eq!(regions[0].pixels.len(), 400);
        assert_eq!(regions[0].color, [10, 120, 250]);
        // it does not touch the edges: no background to drop
        assert_eq!(drop_background(regions, 30, 30).len(), 1);
    }

    #[test]
    fn mono_finds_the_dark_parts() {
        let mut img = solid(30, 20, [250, 250, 250, 255]);
        for y in 2..8 {
            for x in 2..8 {
                img.set(x, y, [20, 20, 20, 255]);
            }
        }
        for y in 10..18 {
            for x in 15..28 {
                img.set(x, y, [60, 60, 60, 255]);
            }
        }
        let regions = mono_regions(&img, 128, 4);
        assert_eq!(regions.len(), 2);
        assert!(regions.iter().all(|r| r.color == [0, 0, 0]));
        let mut sizes: Vec<usize> = regions.iter().map(|r| r.pixels.len()).collect();
        sizes.sort();
        assert_eq!(sizes, vec![36, 104]);
    }

    #[test]
    fn bands_of_a_gradient_join_and_a_distinct_square_stays() {
        // a vertical gradient in steps of 20 (as a quantiser leaves it), with a red square
        let (w, h) = (60u32, 120u32);
        let mut img = Rgba::new(w, h);
        for y in 0..h {
            let v = (40 + 20 * (y / 15)) as u8;
            for x in 0..w {
                img.set(x, y, [v, v, v, 255]);
            }
        }
        for y in 50..70 {
            for x in 20..40 {
                img.set(x, y, [220, 20, 20, 255]);
            }
        }
        let regions = color_regions(&img, settings()).unwrap();
        assert!(regions.len() > 3, "bands expected: {}", regions.len());
        let joined = join_gradients(regions);
        assert_eq!(joined.len(), 2, "{joined:?}");
        assert_eq!(joined[1].color, [220, 20, 20]);
        assert_eq!(joined[1].parent, Some(0));
        assert_eq!(joined[0].visible.count(), (w * h - 400) as f64);
    }
}
