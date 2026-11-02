//! Colour statistics of a region (prompt 087 E8): sums for a least-squares model
//! `c(x, y) = a + b·x + c·y` per channel – merged in O(1), so neighbouring bands of one gradient
//! can be tested and joined cheaply – and the linear gradient that model describes.

/// Sums over a region's pixels; `x`, `y` in normalised image units (see [`ColorStats::add`]).
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ColorStats {
    n: f64,
    sx: f64,
    sy: f64,
    sxx: f64,
    sxy: f64,
    syy: f64,
    sc: [f64; 3],
    sxc: [f64; 3],
    syc: [f64; 3],
    scc: [f64; 3],
}

/// The fitted model: `coef[channel] = [a, b, c]`, root mean square error per channel value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LinearModel {
    pub coef: [[f64; 3]; 3],
    pub rms: f64,
}

/// A linear gradient in image pixels: from `p1` (colour `c1`) to `p2` (colour `c2`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Gradient {
    pub p1: (f64, f64),
    pub p2: (f64, f64),
    pub c1: [u8; 3],
    pub c2: [u8; 3],
}

impl ColorStats {
    /// One pixel at (`x`, `y`) – callers pass normalised coordinates (pixel / longer side) so the
    /// sums stay well conditioned.
    pub fn add(&mut self, x: f64, y: f64, c: [u8; 3]) {
        self.n += 1.0;
        self.sx += x;
        self.sy += y;
        self.sxx += x * x;
        self.sxy += x * y;
        self.syy += y * y;
        for (k, &ch) in c.iter().enumerate() {
            let v = ch as f64;
            self.sc[k] += v;
            self.sxc[k] += x * v;
            self.syc[k] += y * v;
            self.scc[k] += v * v;
        }
    }

    pub fn merge(&mut self, o: &ColorStats) {
        self.n += o.n;
        self.sx += o.sx;
        self.sy += o.sy;
        self.sxx += o.sxx;
        self.sxy += o.sxy;
        self.syy += o.syy;
        for k in 0..3 {
            self.sc[k] += o.sc[k];
            self.sxc[k] += o.sxc[k];
            self.syc[k] += o.syc[k];
            self.scc[k] += o.scc[k];
        }
    }

    pub fn count(&self) -> f64 {
        self.n
    }

    pub fn mean(&self) -> [f64; 3] {
        let n = self.n.max(1.0);
        [self.sc[0] / n, self.sc[1] / n, self.sc[2] / n]
    }

    /// Mean position (normalised units).
    pub fn centre(&self) -> (f64, f64) {
        let n = self.n.max(1.0);
        (self.sx / n, self.sy / n)
    }

    /// Root mean square error of the flat (mean) colour.
    pub fn flat_rms(&self) -> f64 {
        if self.n <= 0.0 {
            return 0.0;
        }
        let sse: f64 = (0..3)
            .map(|k| (self.scc[k] - self.sc[k] * self.sc[k] / self.n).max(0.0))
            .sum();
        (sse / (3.0 * self.n)).sqrt()
    }

    /// The least-squares plane per channel; `None` for degenerate regions (a line, few pixels).
    pub fn fit(&self) -> Option<LinearModel> {
        if self.n < 6.0 {
            return None;
        }
        let m = [
            [self.n, self.sx, self.sy],
            [self.sx, self.sxx, self.sxy],
            [self.sy, self.sxy, self.syy],
        ];
        let det = det3(&m);
        // the spread of the positions: a line of pixels has no plane
        let scale = self.n * self.n * self.n * 1e-12;
        if det.abs() <= scale.max(1e-18) {
            return None;
        }
        let mut coef = [[0.0; 3]; 3];
        let mut sse = 0.0;
        for (k, beta_k) in coef.iter_mut().enumerate() {
            let rhs = [self.sc[k], self.sxc[k], self.syc[k]];
            let beta = solve3(&m, &rhs, det);
            sse +=
                (self.scc[k] - (beta[0] * rhs[0] + beta[1] * rhs[1] + beta[2] * rhs[2])).max(0.0);
            *beta_k = beta;
        }
        Some(LinearModel {
            coef,
            rms: (sse / (3.0 * self.n)).sqrt(),
        })
    }
}

fn det3(m: &[[f64; 3]; 3]) -> f64 {
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
}

/// Cramer's rule (3 × 3 is small enough).
fn solve3(m: &[[f64; 3]; 3], r: &[f64; 3], det: f64) -> [f64; 3] {
    let mut out = [0.0; 3];
    for (col, o) in out.iter_mut().enumerate() {
        let mut a = *m;
        for row in 0..3 {
            a[row][col] = r[row];
        }
        *o = det3(&a) / det;
    }
    out
}

fn channel(v: f64) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

impl LinearModel {
    pub fn at(&self, x: f64, y: f64) -> [f64; 3] {
        let c = |k: usize| self.coef[k][0] + self.coef[k][1] * x + self.coef[k][2] * y;
        [c(0), c(1), c(2)]
    }

    /// The direction the colours change most (principal axis of the channel gradients), unit
    /// length; `None` when nothing changes.
    pub fn direction(&self) -> Option<(f64, f64)> {
        let (mut a, mut b, mut c) = (0.0, 0.0, 0.0);
        for k in 0..3 {
            let (gx, gy) = (self.coef[k][1], self.coef[k][2]);
            a += gx * gx;
            b += gx * gy;
            c += gy * gy;
        }
        if a + c < 1e-12 {
            return None;
        }
        // eigenvector of [[a, b], [b, c]] to the larger eigenvalue
        let angle = 0.5 * (2.0 * b).atan2(a - c);
        Some((angle.cos(), angle.sin()))
    }
}

/// Smallest colour change across a region (per channel, 0–255) worth a gradient.
pub const MIN_DELTA: f64 = 10.0;

/// The gradient of a region when the plane explains its colours clearly better than one flat
/// colour. `corners` = the region's box in normalised units; `norm` = pixels per unit.
pub fn gradient_of(stats: &ColorStats, corners: [(f64, f64); 2], norm: f64) -> Option<Gradient> {
    let model = stats.fit()?;
    let (dx, dy) = model.direction()?;
    let (cx, cy) = stats.centre();
    let [(x0, y0), (x1, y1)] = corners;
    let ts = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)].map(|(x, y)| (x - cx) * dx + (y - cy) * dy);
    let t0 = ts.iter().cloned().fold(f64::INFINITY, f64::min);
    let t1 = ts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    if t1 - t0 <= 0.0 {
        return None;
    }
    let p1 = (cx + t0 * dx, cy + t0 * dy);
    let p2 = (cx + t1 * dx, cy + t1 * dy);
    let a = model.at(p1.0, p1.1);
    let b = model.at(p2.0, p2.1);
    let delta = (0..3).map(|k| (a[k] - b[k]).abs()).fold(0.0, f64::max);
    if delta < MIN_DELTA || model.rms > 0.8 * stats.flat_rms() {
        return None;
    }
    Some(Gradient {
        p1: (p1.0 * norm, p1.1 * norm),
        p2: (p2.0 * norm, p2.1 * norm),
        c1: a.map(channel),
        c2: b.map(channel),
    })
}

/// The mean colour, rounded.
pub fn mean_color(stats: &ColorStats) -> [u8; 3] {
    stats.mean().map(channel)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A horizontal ramp from black to white over `w` × `h` pixels (normalised by `w`).
    fn ramp(w: u32, h: u32) -> ColorStats {
        let mut s = ColorStats::default();
        for y in 0..h {
            for x in 0..w {
                let v = (x as f64 * 255.0 / (w - 1) as f64).round() as u8;
                s.add(x as f64 / w as f64, y as f64 / w as f64, [v, v, v]);
            }
        }
        s
    }

    #[test]
    fn a_ramp_fits_a_plane_exactly() {
        let s = ramp(50, 10);
        let m = s.fit().unwrap();
        assert!(m.rms < 0.5, "{}", m.rms);
        assert!(s.flat_rms() > 50.0);
        let (dx, dy) = m.direction().unwrap();
        assert!(dx.abs() > 0.999 && dy.abs() < 0.01);
    }

    #[test]
    fn a_ramp_becomes_a_gradient_across_its_box() {
        let s = ramp(50, 10);
        let g = gradient_of(&s, [(0.0, 0.0), (49.0 / 50.0, 9.0 / 50.0)], 50.0).unwrap();
        let (lo, hi) = if g.p1.0 < g.p2.0 {
            (g.c1, g.c2)
        } else {
            (g.c2, g.c1)
        };
        assert!(lo[0] <= 2 && hi[0] >= 253, "{g:?}");
        assert!((g.p1.0 - g.p2.0).abs() > 48.0 && (g.p1.1 - g.p2.1).abs() < 0.5);
    }

    #[test]
    fn flat_regions_and_noise_get_no_gradient() {
        let mut flat = ColorStats::default();
        let mut noise = ColorStats::default();
        for y in 0..20 {
            for x in 0..20 {
                flat.add(x as f64 / 20.0, y as f64 / 20.0, [40, 80, 120]);
                let v = if (x * 7 + y * 13) % 3 == 0 { 0 } else { 255 };
                noise.add(x as f64 / 20.0, y as f64 / 20.0, [v, v, v]);
            }
        }
        let corners = [(0.0, 0.0), (1.0, 1.0)];
        assert_eq!(gradient_of(&flat, corners, 20.0), None);
        assert_eq!(mean_color(&flat), [40, 80, 120]);
        assert_eq!(gradient_of(&noise, corners, 20.0), None);
    }

    #[test]
    fn merged_sums_equal_the_sums_of_the_union() {
        let mut a = ColorStats::default();
        let mut b = ColorStats::default();
        let mut all = ColorStats::default();
        for i in 0..30 {
            let (x, y, c) = (i as f64 * 0.1, (i % 7) as f64 * 0.2, [i as u8, 3, 200]);
            if i % 2 == 0 {
                a.add(x, y, c)
            } else {
                b.add(x, y, c)
            }
            all.add(x, y, c);
        }
        a.merge(&b);
        assert_eq!(a.count(), all.count());
        let (m1, m2) = (a.fit().unwrap(), all.fit().unwrap());
        assert!((m1.rms - m2.rms).abs() < 1e-3);
    }

    #[test]
    fn a_line_of_pixels_has_no_plane() {
        let mut s = ColorStats::default();
        for x in 0..40 {
            s.add(x as f64 / 40.0, 0.5, [x as u8, 0, 0]);
        }
        assert_eq!(s.fit(), None);
    }
}
