import { Point } from '../view-transform';

/**
 * Curved outlines of the Smart Guides (prompt 040): ellipses, Bézier and elliptic arc segments as
 * a function of `t ∈ [0, 1]` in DOCUMENT units (the element's matrix already applied). Crossings
 * are found on a polyline of samples and then made exact with Newton's method on the curves
 * themselves (like VectorCraft's `meeting`: project and settle); the nearest point of a curve the
 * same way. Pure.
 */

export interface Curve {
  kind: 'curve';
  at: (t: number) => Point;
  /** Samples along it (more for longer curves). */
  n: number;
  /** A closed curve (an ellipse): `t` wraps. */
  closed?: boolean;
}

/** Anything with a position at `t ∈ [0, 1]`. */
export type Param = (t: number) => Point;

const sampled = new WeakMap<object, Point[]>();

/** The samples of a curve (kept per curve object: a drag looks at them again and again). */
export function samples(c: { at: Param; n: number }): Point[] {
  const known = sampled.get(c);
  if (known && known.length === c.n + 1) return known;
  const ps = Array.from({ length: c.n + 1 }, (_, i) => c.at(i / c.n));
  sampled.set(c, ps);
  return ps;
}

/** Samples for a curve of about `len` document units: ~ every 4 units, 16 … 256. */
export function sampleCount(len: number): number {
  return Math.max(16, Math.min(256, Math.ceil(len / 4)));
}

function crossAt(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-14) return null;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / den;
  const u = (q.x * r.y - q.y * r.x) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? { t, u } : null;
}

/** `t` within [0, 1] (wrapped for a closed curve); `null` outside. */
function inRange(t: number, closed: boolean | undefined): number | null {
  if (closed) return ((t % 1) + 1) % 1;
  return t >= -1e-7 && t <= 1 + 1e-7 ? Math.min(1, Math.max(0, t)) : null;
}

/** Newton on `A(t) − B(u) = 0` from (t, u); the point, or `null` when it does not settle. */
export function settle(
  A: Param,
  B: Param,
  t0: number,
  u0: number,
  closedA?: boolean,
  closedB?: boolean,
): Point | null {
  let t = t0;
  let u = u0;
  const h = 1e-7;
  for (let i = 0; i < 30; i++) {
    const a = A(t);
    const b = B(u);
    const fx = a.x - b.x;
    const fy = a.y - b.y;
    const scale = Math.max(1, Math.abs(a.x), Math.abs(a.y));
    if (Math.hypot(fx, fy) < 1e-10 * scale) return a;
    const at = A(t + h);
    const bu = B(u + h);
    const j11 = (at.x - a.x) / h;
    const j21 = (at.y - a.y) / h;
    const j12 = -(bu.x - b.x) / h;
    const j22 = -(bu.y - b.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-18) return null;
    const nt = inRange(t - (fx * j22 - fy * j12) / det, closedA);
    const nu = inRange(u - (-fx * j21 + fy * j11) / det, closedB);
    if (nt === null || nu === null) return null;
    t = nt;
    u = nu;
  }
  const a = A(t);
  const b = B(u);
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 * Math.max(1, Math.abs(a.x)) ? a : null;
}

/**
 * Where two parametric outlines cross: sampled polylines first, each crossing settled on the
 * curves; duplicates (a crossing on a sample) dropped.
 */
export function curveCrossings(
  A: { at: Param; n: number; closed?: boolean },
  B: { at: Param; n: number; closed?: boolean },
): Point[] {
  const pa = samples(A);
  const pb = samples(B);
  const out: Point[] = [];
  for (let i = 0; i < A.n; i++) {
    const a0 = pa[i];
    const a1 = pa[i + 1];
    const ax0 = Math.min(a0.x, a1.x);
    const ax1 = Math.max(a0.x, a1.x);
    const ay0 = Math.min(a0.y, a1.y);
    const ay1 = Math.max(a0.y, a1.y);
    for (let j = 0; j < B.n; j++) {
      const b0 = pb[j];
      const b1 = pb[j + 1];
      if (Math.max(b0.x, b1.x) < ax0 || Math.min(b0.x, b1.x) > ax1) continue;
      if (Math.max(b0.y, b1.y) < ay0 || Math.min(b0.y, b1.y) > ay1) continue;
      const x = crossAt(a0, a1, b0, b1);
      if (!x) continue;
      const p = settle(A.at, B.at, (i + x.t) / A.n, (j + x.u) / B.n, A.closed, B.closed);
      if (p && !out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)) out.push(p);
    }
  }
  return out;
}

/** The point of a curve nearest to `p`: the nearest sample, then a golden-section search. */
export function nearestOnCurve(c: { at: Param; n: number }, p: Point): Point {
  const d = (t: number) => {
    const q = c.at(t);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= c.n; i++) {
    const v = d(i / c.n);
    if (v < bestD) [best, bestD] = [i / c.n, v];
  }
  let lo = Math.max(0, best - 1 / c.n);
  let hi = Math.min(1, best + 1 / c.n);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 40; k++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (d(m1) < d(m2)) hi = m2;
    else lo = m1;
  }
  return c.at((lo + hi) / 2);
}

/** A cubic Bézier. */
export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point): Param {
  return (t) => {
    const s = 1 - t;
    const a = s * s * s;
    const b = 3 * s * s * t;
    const c = 3 * s * t * t;
    const d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  };
}

/** A quadratic Bézier. */
export function quadAt(p0: Point, p1: Point, p2: Point): Param {
  return (t) => {
    const s = 1 - t;
    return {
      x: s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x,
      y: s * s * p0.y + 2 * s * t * p1.y + t * t * p2.y,
    };
  };
}

/** An ellipse (or its arc from `theta1` over `delta`) rotated by `phi`, in its own units. */
export function ellipseAt(
  c: Point,
  rx: number,
  ry: number,
  phi = 0,
  theta1 = 0,
  delta = 2 * Math.PI,
): Param {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return (t) => {
    const a = theta1 + delta * t;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return { x: c.x + cos * x - sin * y, y: c.y + sin * x + cos * y };
  };
}
