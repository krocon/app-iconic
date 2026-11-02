//! Shape recognition (prompt 087 stage B, E9–E11): a traced region that is a rectangle, a
//! rounded rectangle, an ellipse or a circle becomes that element – as a user would draw it –
//! instead of a path; equal shapes get equal sizes and shared edges, near colours one colour.
//! Pure geometry on pixel masks, in work pixels.

use super::raster::Rgba;

/// A recognised primitive (pixel units, edges of pixels).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Primitive {
    /// `r` = corner radius, 0 for sharp corners.
    Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        r: f64,
    },
    Ellipse {
        cx: f64,
        cy: f64,
        rx: f64,
        ry: f64,
    },
}

/// A region as a mask: `width` × `height` pixels from (`left`, `top`), `true` = inside.
pub struct Mask<'a> {
    pub left: i32,
    pub top: i32,
    pub width: usize,
    pub height: usize,
    pub inside: &'a dyn Fn(usize, usize) -> bool,
}

/// Smallest side of a shape worth recognising (pixels).
pub const MIN_SIDE: f64 = 4.0;

/// Signed distance to a rounded box centred at the origin (negative inside).
fn round_rect_sdf(px: f64, py: f64, w: f64, h: f64, r: f64) -> f64 {
    let qx = px.abs() - (w / 2.0 - r);
    let qy = py.abs() - (h / 2.0 - r);
    let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
    outside + qx.max(qy).min(0.0) - r
}

/// Approximate signed distance to an ellipse centred at the origin (exact for circles).
fn ellipse_sdf(px: f64, py: f64, rx: f64, ry: f64) -> f64 {
    (((px / rx).powi(2) + (py / ry).powi(2)).sqrt() - 1.0) * rx.min(ry)
}

#[cfg(test)]
fn in_round_rect(px: f64, py: f64, w: f64, h: f64, r: f64) -> bool {
    round_rect_sdf(px, py, w, h, r) <= 0.0
}

#[cfg(test)]
fn in_ellipse(px: f64, py: f64, rx: f64, ry: f64) -> bool {
    ellipse_sdf(px, py, rx, ry) <= 0.0
}

/// Pixels where the mask and the candidate disagree (pixel centres tested), and how far the
/// worst of them lies from the candidate's outline.
fn mismatch(m: &Mask, sdf: &dyn Fn(f64, f64) -> f64) -> (f64, f64) {
    let (cx, cy) = (m.width as f64 / 2.0, m.height as f64 / 2.0);
    let (mut n, mut worst) = (0.0, 0.0f64);
    for y in 0..m.height {
        for x in 0..m.width {
            let d = sdf(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy);
            if (d <= 0.0) != (m.inside)(x, y) {
                n += 1.0;
                worst = worst.max(d.abs());
            }
        }
    }
    (n, worst)
}

/// The primitive this mask is, if any: the better of a rounded rectangle (radius from the area
/// the corners miss) and an ellipse, accepted when they disagree only along the outline.
pub fn recognise(m: &Mask, area: usize) -> Option<Primitive> {
    let (w, h) = (m.width as f64, m.height as f64);
    if w < MIN_SIDE || h < MIN_SIDE || area == 0 {
        return None;
    }
    let perimeter = 2.0 * (w + h);
    // anti-aliased edges move the outline by about half a pixel – but no notch, hole or bulge:
    // every disagreeing pixel lies at the outline
    let allowed = 0.5 * perimeter + 6.0;
    let reach = (w.max(h) * 0.015).max(1.5);
    let fits = |(n, worst): (f64, f64)| n <= allowed && worst <= reach;
    let missing = (w * h - area as f64).max(0.0);
    let estimate = (missing / (4.0 - std::f64::consts::PI))
        .sqrt()
        .min(w.min(h) / 2.0);
    let r = refine_radius(m, estimate);
    let r = if r < 1.0 { 0.0 } else { r };
    let rect = mismatch(m, &|x, y| round_rect_sdf(x, y, w, h, r));
    let ell = mismatch(m, &|x, y| ellipse_sdf(x, y, w / 2.0, h / 2.0));
    let (left, top) = (m.left as f64, m.top as f64);
    // a rounded square with half its side as radius is a circle: the ellipse wins unless the
    // rectangle fits clearly better
    if fits(ell) && (!fits(rect) || ell.0 <= rect.0 * 1.5 + 4.0) {
        return Some(Primitive::Ellipse {
            cx: left + w / 2.0,
            cy: top + h / 2.0,
            rx: w / 2.0,
            ry: h / 2.0,
        });
    }
    fits(rect).then_some(Primitive::Rect {
        x: left,
        y: top,
        w,
        h,
        r,
    })
}

impl Primitive {
    fn sdf(&self, px: f64, py: f64) -> f64 {
        match *self {
            Primitive::Rect { x, y, w, h, r } => {
                round_rect_sdf(px - x - w / 2.0, py - y - h / 2.0, w, h, r)
            }
            Primitive::Ellipse { cx, cy, rx, ry } => ellipse_sdf(px - cx, py - cy, rx, ry),
        }
    }

    fn perimeter(&self) -> f64 {
        match *self {
            Primitive::Rect { w, h, r, .. } => {
                2.0 * (w + h) - (8.0 - 2.0 * std::f64::consts::PI) * r
            }
            Primitive::Ellipse { rx, ry, .. } => {
                std::f64::consts::PI
                    * (3.0 * (rx + ry) - ((3.0 * rx + ry) * (rx + 3.0 * ry)).sqrt())
            }
        }
    }

    fn bounds(&self) -> (f64, f64, f64, f64) {
        match *self {
            Primitive::Rect { x, y, w, h, .. } => (x, y, x + w, y + h),
            Primitive::Ellipse { cx, cy, rx, ry } => (cx - rx, cy - ry, cx + rx, cy + ry),
        }
    }

    /// The outline moved outwards by `d` pixels.
    fn grown(self, d: f64) -> Primitive {
        match self {
            Primitive::Rect { x, y, w, h, r } => Primitive::Rect {
                x: x - d,
                y: y - d,
                w: (w + 2.0 * d).max(1.0),
                h: (h + 2.0 * d).max(1.0),
                r: if r > 0.0 { (r + d).max(0.0) } else { 0.0 },
            },
            Primitive::Ellipse { cx, cy, rx, ry } => Primitive::Ellipse {
                cx,
                cy,
                rx: (rx + d).max(0.5),
                ry: (ry + d).max(0.5),
            },
        }
    }
}

/// Smallest colour contrast (Euclidean, 0–441) across an outline to read sub-pixel edges.
pub const EDGE_CONTRAST: f64 = 40.0;

/// Largest spread (root mean square distance to the mean) of a ring of pixels that still counts
/// as one colour.
pub const RING_SPREAD: f64 = 24.0;

/// Mean colour of the pixels whose distance to the outline lies in `range` – `None` when there
/// are too few or they are not one colour (a neighbour close by, a texture).
fn ring_mean(p: &Primitive, img: &Rgba, range: (f64, f64)) -> Option<[f64; 3]> {
    let (x0, y0, x1, y1) = p.bounds();
    let cx = |v: f64| v.clamp(0.0, img.width as f64) as u32;
    let cy = |v: f64| v.clamp(0.0, img.height as f64) as u32;
    let (mut sum, mut sq, mut n) = ([0.0; 3], 0.0, 0.0);
    for y in cy(y0 - 4.0)..cy(y1 + 4.0) {
        for x in cx(x0 - 4.0)..cx(x1 + 4.0) {
            let d = p.sdf(x as f64 + 0.5, y as f64 + 0.5);
            let px = img.pixel(x, y);
            if d >= range.0 && d <= range.1 && px[3] >= 128 {
                for k in 0..3 {
                    sum[k] += px[k] as f64;
                    sq += (px[k] as f64).powi(2);
                }
                n += 1.0;
            }
        }
    }
    if n < 4.0 {
        return None;
    }
    let mean = sum.map(|v| v / n);
    let spread = (sq / n - mean.iter().map(|m| m * m).sum::<f64>())
        .max(0.0)
        .sqrt();
    (spread <= RING_SPREAD).then_some(mean)
}

/// Moves the outline to where the anti-aliased pixels put it (E10): the colours just inside and
/// just outside the outline are measured; a pixel on the outline with a colour between them
/// tells how much of it the shape covers, and the summed difference to the coverage of the
/// current outline, spread over its length, is how far the edge is off. A mask from colour
/// clusters is up to a pixel too small or too large – small shapes (a dot, the counter of an O)
/// show that. Pixels of other colours (a third region) are left out.
pub fn refine_edges(p: Primitive, img: &Rgba) -> Primitive {
    let (Some(inside), Some(outside)) = (
        ring_mean(&p, img, (-3.5, -2.0)),
        ring_mean(&p, img, (2.0, 3.5)),
    ) else {
        return p;
    };
    let d_in: [f64; 3] = std::array::from_fn(|k| inside[k] - outside[k]);
    let contrast2: f64 = d_in.iter().map(|v| v * v).sum();
    if contrast2 < EDGE_CONTRAST * EDGE_CONTRAST {
        return p;
    }
    let (x0, y0, x1, y1) = p.bounds();
    let clamp_x = |v: f64| v.clamp(0.0, img.width as f64) as u32;
    let clamp_y = |v: f64| v.clamp(0.0, img.height as f64) as u32;
    let mut off = 0.0;
    for y in clamp_y(y0 - 2.0)..clamp_y(y1 + 2.0) {
        for x in clamp_x(x0 - 2.0)..clamp_x(x1 + 2.0) {
            let d = p.sdf(x as f64 + 0.5, y as f64 + 0.5);
            if d.abs() > 1.5 {
                continue;
            }
            let px = img.pixel(x, y);
            if px[3] < 128 {
                continue;
            }
            let c: [f64; 3] = std::array::from_fn(|k| px[k] as f64 - outside[k]);
            let t = (c[0] * d_in[0] + c[1] * d_in[1] + c[2] * d_in[2]) / contrast2;
            let off_line: f64 = (0..3)
                .map(|k| (c[k] - t * d_in[k]).powi(2))
                .sum::<f64>()
                .sqrt();
            if off_line > 30.0 {
                continue;
            }
            off += t.clamp(0.0, 1.0) - (0.5 - d).clamp(0.0, 1.0);
        }
    }
    // in quarter pixels: less is noise (and would only make the numbers longer)
    let delta = ((off / p.perimeter().max(1.0)).clamp(-1.5, 1.5) * 4.0).round() / 4.0;
    if delta == 0.0 { p } else { p.grown(delta) }
}

/// The corner radius that fits the mask best near `estimate` (from the area the corners miss),
/// in quarter pixels; only the four corner boxes are compared – the straight edges do not
/// depend on the radius.
fn refine_radius(m: &Mask, estimate: f64) -> f64 {
    let (w, h) = (m.width as f64, m.height as f64);
    let max_r = w.min(h) / 2.0;
    let lo = (estimate - 2.0).max(0.0);
    let hi = (estimate + 2.0).min(max_r);
    let box_side = ((hi + 2.0).ceil() as usize)
        .min(m.width / 2)
        .min(m.height / 2);
    let (cx, cy) = (w / 2.0, h / 2.0);
    let corner_err = |r: f64| {
        let mut n = 0;
        for &(x0, y0) in &[
            (0, 0),
            (m.width - box_side, 0),
            (0, m.height - box_side),
            (m.width - box_side, m.height - box_side),
        ] {
            for y in y0..y0 + box_side {
                for x in x0..x0 + box_side {
                    let p =
                        round_rect_sdf(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy, w, h, r) <= 0.0;
                    if p != (m.inside)(x, y) {
                        n += 1;
                    }
                }
            }
        }
        n
    };
    // every quarter pixel; of the radii with the fewest mismatches the middle one (pixel centres
    // cannot tell them apart, the true radius lies among them)
    let mut errs = Vec::new();
    let mut r = (lo * 4.0).round() / 4.0;
    while r <= hi + 1e-9 {
        errs.push((corner_err(r), r));
        r += 0.25;
    }
    let Some(min) = errs.iter().map(|e| e.0).min() else {
        return estimate;
    };
    let best: Vec<f64> = errs.iter().filter(|e| e.0 == min).map(|e| e.1).collect();
    let mid = (best[0] + best[best.len() - 1]) / 2.0;
    (mid * 4.0).round() / 4.0
}

/// Splits values into runs: sorted, a run ends where a value lies more than `tol` beyond the
/// run's first value (no chaining – 3, 4.4, 5.8, 7.2 are not one size). Answers the run index of
/// each input (in input order).
fn runs(values: &[f64], tol: impl Fn(f64) -> f64) -> Vec<usize> {
    let mut order: Vec<usize> = (0..values.len()).collect();
    order.sort_by(|&a, &b| values[a].total_cmp(&values[b]));
    let mut out = vec![0; values.len()];
    let mut run = 0;
    let mut start = f64::NAN;
    for (k, &i) in order.iter().enumerate() {
        if k == 0 {
            start = values[i];
        } else if values[i] - start > tol(start) {
            run += 1;
            start = values[i];
        }
        out[i] = run;
    }
    out
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

/// Members of each group with at least two members.
fn groups(ids: &[usize]) -> Vec<Vec<usize>> {
    let mut map: std::collections::BTreeMap<usize, Vec<usize>> = Default::default();
    for (i, &g) in ids.iter().enumerate() {
        map.entry(g).or_default().push(i);
    }
    map.into_values().filter(|m| m.len() > 1).collect()
}

/// Sets each value to the median of its run.
fn snap(values: &mut [f64], tol: impl Fn(f64) -> f64) {
    for members in groups(&runs(values, tol)) {
        let m = median(members.iter().map(|&i| values[i]).collect());
        for i in members {
            values[i] = m;
        }
    }
}

/// How far two sizes may differ and still count as the same (pixels).
fn size_tol(v: f64) -> f64 {
    (v.abs() * 0.025).max(1.5)
}

/// Equal shapes and shared edges (E11): rectangles whose width, height and radius all nearly
/// agree get the same size, ellipses likewise; then edges (rectangles) and centres (ellipses)
/// that nearly line up share one position – as a user lining up with Smart Guides.
pub fn harmonize(shapes: &mut [&mut Primitive]) {
    for want_rect in [true, false] {
        let list: Vec<usize> = (0..shapes.len())
            .filter(|&i| matches!(*shapes[i], Primitive::Rect { .. }) == want_rect)
            .collect();
        if list.len() < 2 {
            continue;
        }
        // [x, y, w, h, r] or [cx, cy, rx, ry, 0]
        let mut v: Vec<[f64; 5]> = list
            .iter()
            .map(|&i| match *shapes[i] {
                Primitive::Rect { x, y, w, h, r } => [x, y, w, h, r],
                Primitive::Ellipse { cx, cy, rx, ry } => [cx, cy, rx, ry, 0.0],
            })
            .collect();
        let col = |v: &[[f64; 5]], k: usize| v.iter().map(|a| a[k]).collect::<Vec<f64>>();
        // sizes: same run in every size dimension
        let (wr, hr, rr) = (
            runs(&col(&v, 2), size_tol),
            runs(&col(&v, 3), size_tol),
            runs(&col(&v, 4), size_tol),
        );
        let n = v.len();
        let key: Vec<usize> = (0..n).map(|j| (wr[j] * n + hr[j]) * n + rr[j]).collect();
        for members in groups(&key) {
            let medians: Vec<f64> = (2..5)
                .map(|k| median(members.iter().map(|&j| v[j][k]).collect()))
                .collect();
            for &j in &members {
                v[j][2..5].copy_from_slice(&medians);
            }
        }
        // positions
        for k in 0..2 {
            let mut c = col(&v, k);
            snap(&mut c, |_| 1.5);
            for (j, value) in c.into_iter().enumerate() {
                v[j][k] = value;
            }
        }
        for (j, &i) in list.iter().enumerate() {
            let [a, b, c, d, e] = v[j];
            *shapes[i] = if want_rect {
                Primitive::Rect {
                    x: a,
                    y: b,
                    w: c,
                    h: d,
                    r: e.min(c.min(d) / 2.0),
                }
            } else {
                Primitive::Ellipse {
                    cx: a,
                    cy: b,
                    rx: c,
                    ry: d,
                }
            };
        }
    }
}

/// Colours a user would take from one palette (E11): colours at most `tol` apart per channel join
/// the most used one of their group. `colors` = (colour, pixel count); answers the new colours.
pub fn harmonize_colors(colors: &[([u8; 3], f64)], tol: u8) -> Vec<[u8; 3]> {
    let mut order: Vec<usize> = (0..colors.len()).collect();
    order.sort_by(|&a, &b| colors[b].1.total_cmp(&colors[a].1));
    let mut palette: Vec<[u8; 3]> = Vec::new();
    let mut out = vec![[0u8; 3]; colors.len()];
    for i in order {
        let c = colors[i].0;
        let near = palette
            .iter()
            .find(|p| (0..3).all(|k| (p[k] as i32 - c[k] as i32).abs() <= tol as i32));
        out[i] = match near {
            Some(p) => *p,
            None => {
                palette.push(c);
                c
            }
        };
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mask_of(w: usize, h: usize, f: impl Fn(f64, f64) -> bool) -> (Vec<bool>, usize) {
        let mut bits = vec![false; w * h];
        let mut area = 0;
        for y in 0..h {
            for x in 0..w {
                let inside = f(
                    x as f64 + 0.5 - w as f64 / 2.0,
                    y as f64 + 0.5 - h as f64 / 2.0,
                );
                bits[y * w + x] = inside;
                area += inside as usize;
            }
        }
        (bits, area)
    }

    fn recognise_bits(bits: &[bool], w: usize, h: usize, area: usize) -> Option<Primitive> {
        let f = |x: usize, y: usize| bits[y * w + x];
        recognise(
            &Mask {
                left: 10,
                top: 20,
                width: w,
                height: h,
                inside: &f,
            },
            area,
        )
    }

    #[test]
    fn a_rounded_rectangle_is_recognised_with_its_radius() {
        let (bits, area) = mask_of(120, 80, |x, y| in_round_rect(x, y, 120.0, 80.0, 18.0));
        match recognise_bits(&bits, 120, 80, area) {
            Some(Primitive::Rect { x, y, w, h, r }) => {
                assert_eq!((x, y, w, h), (10.0, 20.0, 120.0, 80.0));
                assert!((r - 18.0).abs() < 1.5, "{r}");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_sharp_rectangle_has_no_radius() {
        let (bits, area) = mask_of(30, 12, |_, _| true);
        assert_eq!(
            recognise_bits(&bits, 30, 12, area),
            Some(Primitive::Rect {
                x: 10.0,
                y: 20.0,
                w: 30.0,
                h: 12.0,
                r: 0.0
            })
        );
    }

    #[test]
    fn an_ellipse_and_a_circle_are_recognised() {
        let (bits, area) = mask_of(90, 50, |x, y| in_ellipse(x, y, 45.0, 25.0));
        assert!(matches!(
            recognise_bits(&bits, 90, 50, area),
            Some(Primitive::Ellipse { rx, ry, .. }) if rx == 45.0 && ry == 25.0
        ));
        let (bits, area) = mask_of(41, 41, |x, y| in_ellipse(x, y, 20.5, 20.5));
        assert!(matches!(
            recognise_bits(&bits, 41, 41, area),
            Some(Primitive::Ellipse { cx, cy, .. }) if cx == 30.5 && cy == 40.5
        ));
    }

    #[test]
    fn other_shapes_stay_paths() {
        // a triangle, a ring and an L
        let (bits, area) = mask_of(60, 60, |x, y| y > -30.0 + (x.abs() * 2.0));
        assert_eq!(recognise_bits(&bits, 60, 60, area), None);
        let (bits, area) = mask_of(60, 60, |x, y| {
            let d = (x * x + y * y).sqrt();
            (18.0..=30.0).contains(&d)
        });
        assert_eq!(recognise_bits(&bits, 60, 60, area), None);
        let (bits, area) = mask_of(60, 60, |x, y| x < -10.0 || y > 10.0);
        assert_eq!(recognise_bits(&bits, 60, 60, area), None);
    }

    #[test]
    fn letters_with_notches_or_holes_stay_paths() {
        // an N (a box with two notches) and an O (a ring) of text size
        let (bits, area) = mask_of(28, 40, |x, y| {
            let t = (y + 20.0) / 40.0 * 28.0 - 14.0;
            x.abs() > 8.0 || (x - t).abs() < 5.0
        });
        assert_eq!(recognise_bits(&bits, 28, 40, area), None);
        let (bits, area) = mask_of(30, 36, |x, y| {
            in_ellipse(x, y, 15.0, 18.0) && !in_ellipse(x, y, 7.0, 10.0)
        });
        assert_eq!(recognise_bits(&bits, 30, 36, area), None);
    }

    #[test]
    fn tiny_regions_are_not_recognised() {
        let (bits, area) = mask_of(3, 3, |_, _| true);
        assert_eq!(recognise_bits(&bits, 3, 3, area), None);
    }

    #[test]
    fn edges_move_to_where_the_anti_aliasing_puts_them() {
        // a dark disc of radius 10.6 on white, anti-aliased by supersampling; the mask a colour
        // cluster would give is the pixels more than half covered, the outline found from it
        // is refined towards the true radius
        let mut img = Rgba::new(40, 40);
        for y in 0..40 {
            for x in 0..40 {
                let mut cov = 0.0;
                for sy in 0..8 {
                    for sx in 0..8 {
                        let px = x as f64 + (sx as f64 + 0.5) / 8.0 - 20.0;
                        let py = y as f64 + (sy as f64 + 0.5) / 8.0 - 20.0;
                        cov += ((px * px + py * py).sqrt() <= 10.6) as u8 as f64 / 64.0;
                    }
                }
                let v = (255.0 * (1.0 - cov)).round() as u8;
                img.set(x, y, [v, v, v, 255]);
            }
        }
        let small = Primitive::Ellipse {
            cx: 20.0,
            cy: 20.0,
            rx: 9.5,
            ry: 9.5,
        };
        match refine_edges(small, &img) {
            Primitive::Ellipse { rx, ry, .. } => {
                assert!((rx - 10.6).abs() <= 0.25 && rx == ry, "{rx}");
            }
            other => panic!("{other:?}"),
        }
        // a neighbour of the same colour right beside it: the outside is no one colour, the
        // outline stays
        let mut pair = img.clone();
        for y in 8..32 {
            for x in 31..34 {
                pair.set(x, y, [0, 0, 0, 255]);
            }
        }
        assert_eq!(refine_edges(small, &pair), small);
        // no contrast: unchanged
        let mut flat = Rgba::new(40, 40);
        flat.data.fill(200);
        assert_eq!(refine_edges(small, &flat), small);
    }

    #[test]
    fn harmonize_gives_equal_shapes_one_size_and_shared_edges() {
        let mut a = Primitive::Rect {
            x: 10.0,
            y: 100.0,
            w: 120.0,
            h: 80.0,
            r: 18.0,
        };
        let mut b = Primitive::Rect {
            x: 160.4,
            y: 101.0,
            w: 121.0,
            h: 79.0,
            r: 17.0,
        };
        let mut c = Primitive::Rect {
            x: 310.0,
            y: 100.6,
            w: 119.6,
            h: 80.0,
            r: 18.4,
        };
        let mut big = Primitive::Rect {
            x: 0.0,
            y: 0.0,
            w: 600.0,
            h: 400.0,
            r: 40.0,
        };
        let mut e = Primitive::Ellipse {
            cx: 5.0,
            cy: 5.0,
            rx: 4.0,
            ry: 4.0,
        };
        harmonize(&mut [&mut a, &mut b, &mut c, &mut big, &mut e]);
        let size = |p: Primitive| match p {
            Primitive::Rect { y, w, h, r, .. } => (y, w, h, r),
            _ => unreachable!(),
        };
        assert_eq!(size(a), size(b));
        assert_eq!(size(b), size(c));
        assert_eq!(size(a), (100.6, 120.0, 80.0, 18.0));
        assert_eq!(
            big,
            Primitive::Rect {
                x: 0.0,
                y: 0.0,
                w: 600.0,
                h: 400.0,
                r: 40.0
            }
        );
        assert_eq!(
            e,
            Primitive::Ellipse {
                cx: 5.0,
                cy: 5.0,
                rx: 4.0,
                ry: 4.0
            }
        );
    }

    #[test]
    fn harmonize_does_not_chain_different_sizes() {
        let mut dots: Vec<Primitive> = [3.5, 5.0, 6.4, 7.8, 8.75]
            .iter()
            .enumerate()
            .map(|(i, &r)| Primitive::Ellipse {
                cx: i as f64 * 40.0,
                cy: 0.0,
                rx: r,
                ry: r,
            })
            .collect();
        let before = dots.clone();
        harmonize(&mut dots.iter_mut().collect::<Vec<_>>());
        let rx = |p: &Primitive| match p {
            Primitive::Ellipse { rx, .. } => *rx,
            _ => unreachable!(),
        };
        // 3.5 and 5 are one size; 8.75 keeps its own
        assert_eq!(rx(&dots[0]), rx(&dots[1]));
        assert_eq!(rx(&dots[4]), rx(&before[4]));
        // a rectangle as wide but not as high is no equal shape
        let mut a = Primitive::Rect {
            x: 0.0,
            y: 0.0,
            w: 50.0,
            h: 20.0,
            r: 0.0,
        };
        let mut b = Primitive::Rect {
            x: 100.0,
            y: 0.0,
            w: 50.5,
            h: 40.0,
            r: 0.0,
        };
        harmonize(&mut [&mut a, &mut b]);
        assert_eq!(
            a,
            Primitive::Rect {
                x: 0.0,
                y: 0.0,
                w: 50.0,
                h: 20.0,
                r: 0.0
            }
        );
    }

    #[test]
    fn near_colours_join_the_most_used_one() {
        let out = harmonize_colors(
            &[
                ([40, 45, 55], 10.0),
                ([42, 47, 52], 500.0),
                ([200, 40, 40], 30.0),
            ],
            6,
        );
        assert_eq!(out, vec![[42, 47, 52], [42, 47, 52], [200, 40, 40]]);
    }
}
