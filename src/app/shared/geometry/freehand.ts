import { Point } from './view-transform';

/**
 * The freehand pipeline (design 013 E1), pure. Taken over from the template AppIconic
 * (`Features/Canvas/FreeHand/PathFitter.swift`, `FreeHandToolAgent.swift`, Marc Kronberg) with
 * its parameters: Ramer-Douglas-Peucker (`epsilon` 2.5), centripetal Catmull-Rom → cubic Béziers
 * (`alpha` 0.5), one decimal, at most 4 096 points.
 */

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

export const FREEHAND_DEFAULTS = {
  epsilon: 2.5,
  /** Screen pixels between two samples (design 013 E2). */
  minDistance: 3,
  /** Shortest time between two samples (120 Hz). */
  minInterval: 1000 / 120,
  decimals: 1,
  alpha: 0.5,
  maxPoints: 4096,
  /** Auto-close: end this near the start (screen pixels) … */
  closeTolerance: 12,
} as const;

export interface FreehandOptions {
  closed: boolean;
  epsilon?: number;
  alpha?: number;
  decimals?: number;
  maxPoints?: number;
}

const EPS = Number.EPSILON;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const isNear = (a: Point, b: Point, tolerance = 0.001) =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

/** Distance of `p` to the segment a–b (to the nearer end outside of it). */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const lx = b.x - a.x;
  const ly = b.y - a.y;
  const len2 = lx * lx + ly * ly;
  if (len2 <= Number.MIN_VALUE) return dist(p, a);
  const t = ((p.x - a.x) * lx + (p.y - a.y) * ly) / len2;
  if (t < 0) return dist(p, a);
  if (t > 1) return dist(p, b);
  return dist(p, { x: a.x + lx * t, y: a.y + ly * t });
}

/** Ramer-Douglas-Peucker (iterative); `closed` ends on the start point. */
export function simplify(points: readonly Point[], epsilon: number, closed: boolean): Point[] {
  if (points.length <= 2) return [...points];
  const tol = Math.max(epsilon, 0);
  const work = [...points];
  if (closed && !isNear(work[0], work[work.length - 1])) work.push(work[0]);
  const n = work.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;
    let max = 0;
    let index = 0;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(work[i], work[start], work[end]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max > tol) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  const out = work.filter((_, i) => keep[i]);
  if (closed && out.length && !isNear(out[out.length - 1], out[0])) out.push(out[0]);
  return out;
}

/** Every `step`-th point, the last one kept (template `downsampled(limit:)`). */
export function downsample(points: readonly Point[], limit: number): Point[] {
  if (limit <= 2 || points.length <= limit) return [...points];
  const step = Math.max(1, Math.ceil(points.length / limit));
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Centripetal Catmull-Rom through `points` as cubic Béziers (one per gap). */
export function catmullRomToCubics(
  points: readonly Point[],
  closed: boolean,
  alpha: number = FREEHAND_DEFAULTS.alpha,
): Cubic[] {
  if (points.length < 2) return [];
  const a = Math.max(alpha, 0);
  const pts = [...points];
  if (closed && isNear(pts[0], pts[pts.length - 1])) pts.pop();
  const n = pts.length;
  const segments = closed ? n : Math.max(n - 1, 0);
  const out: Cubic[] = [];
  for (let i = 0; i < segments; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i % n];
    const p2 = pts[(i + 1) % n];
    const p3 = closed ? pts[(i + 2) % n] : i + 2 < n ? pts[i + 2] : pts[Math.min(i + 1, n - 1)];
    const t0 = 0;
    let t1 = t0 + Math.pow(dist(p0, p1), a);
    let t2 = t1 + Math.pow(dist(p1, p2), a);
    let t3 = t2 + Math.pow(dist(p2, p3), a);
    if (!Number.isFinite(t1) || t1 - t0 < EPS) t1 = t0 + 1;
    if (!Number.isFinite(t2) || t2 - t1 < EPS) t2 = t1 + 1;
    if (!Number.isFinite(t3) || t3 - t2 < EPS) t3 = t2 + 1;
    const dt21 = t2 - t1;
    const dt20 = t2 - t0;
    const dt31 = t3 - t1;
    const m1 = dt20 > EPS ? { x: (p2.x - p0.x) / dt20, y: (p2.y - p0.y) / dt20 } : { x: 0, y: 0 };
    const m2 = dt31 > EPS ? { x: (p3.x - p1.x) / dt31, y: (p3.y - p1.y) / dt31 } : { x: 0, y: 0 };
    const s = dt21 / 3;
    out.push({
      p0: p1,
      c1: { x: p1.x + m1.x * s, y: p1.y + m1.y * s },
      c2: { x: p2.x - m2.x * s, y: p2.y - m2.y * s },
      p1: p2,
    });
  }
  return out;
}

/** `value` rounded to `decimals` (template `quantize`). */
export function quantize(value: number, decimals: number): number {
  if (decimals <= 0) return Math.round(value);
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

/** A number without needless zeros ("10", "20.1", never "-0"). */
function num(v: number, decimals: number): string {
  const q = quantize(v, Math.max(decimals, 0));
  return String(Object.is(q, -0) ? 0 : q);
}

/** `M x y C … [Z]` (template `SVGPathBuilder.string`); empty without cubics. */
export function cubicsToPath(cubics: readonly Cubic[], decimals: number, close: boolean): string {
  if (!cubics.length) return '';
  const n = (v: number) => num(v, decimals);
  const parts = [`M ${n(cubics[0].p0.x)} ${n(cubics[0].p0.y)}`];
  for (const c of cubics) {
    parts.push(`C ${n(c.c1.x)} ${n(c.c1.y)} ${n(c.c2.x)} ${n(c.c2.y)} ${n(c.p1.x)} ${n(c.p1.y)}`);
  }
  if (close) parts.push('Z');
  return parts.join(' ');
}

/** The whole pipeline: points → simplified → smoothed → `d`; `null` for fewer than 2 points. */
export function freehandPath(points: readonly Point[], options: FreehandOptions): string | null {
  const D = FREEHAND_DEFAULTS;
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length < 2) return null;
  let simple = simplify(finite, options.epsilon ?? D.epsilon, options.closed);
  simple = downsample(simple, options.maxPoints ?? D.maxPoints);
  const cubics = catmullRomToCubics(simple, options.closed, options.alpha ?? D.alpha);
  return cubics.length
    ? cubicsToPath(cubics, options.decimals ?? D.decimals, options.closed)
    : null;
}

/**
 * A sample is taken when it is at least `minDistance` screen pixels from the last one AND at
 * least `minInterval` ms later (design 013 E2).
 */
export function acceptSample(
  last: { p: Point; t: number } | null,
  p: Point,
  t: number,
  pxPerUnit: number,
): boolean {
  if (!last) return true;
  const D = FREEHAND_DEFAULTS;
  return dist(last.p, p) * pxPerUnit >= D.minDistance && t - last.t >= D.minInterval;
}

/**
 * Auto-close (design 013 E4): the stroke ends within `closeTolerance` screen pixels of its start
 * and is longer than four times that.
 */
export function shouldAutoClose(points: readonly Point[], pxPerUnit: number): boolean {
  if (points.length < 3) return false;
  const tol = FREEHAND_DEFAULTS.closeTolerance;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  return (
    dist(points[0], points[points.length - 1]) * pxPerUnit <= tol && length * pxPerUnit > 4 * tol
  );
}
