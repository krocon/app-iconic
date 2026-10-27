import { Point } from '../view-transform';

/**
 * The shapes of the sketch tools (design 019 E8), all in DOCUMENT units (y down). Angles in
 * radians as `Math.atan2` gives them (clockwise on screen); the fields show degrees counter-
 * clockwise like Fusion (`degFromVector`). Pure.
 */

export interface Circle {
  c: Point;
  r: number;
}

export type SketchShape =
  | { kind: 'line'; a: Point; b: Point }
  /** Centre, size (≥ 0) and rotation of the unrotated rectangle about its centre. */
  | { kind: 'rect'; c: Point; w: number; h: number; angle: number }
  | { kind: 'circle'; c: Point; r: number }
  /** `start` = angle of the start point, `sweep` signed (positive = clockwise on screen), |sweep| < 2π. */
  | { kind: 'arc'; c: Point; r: number; start: number; sweep: number };

export const EPS = 1e-9;
export const TAU = Math.PI * 2;
/** Largest sweep of one arc (a whole circle is no SVG arc). */
export const MAX_SWEEP = TAU * (359.9 / 360);

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Left normal on screen (y down): (x, y) → (y, −x). */
export const normal = (a: Point): Point => ({ x: a.y, y: -a.x });

export function unit(a: Point): Point | null {
  const l = len(a);
  return l > EPS ? { x: a.x / l, y: a.y / l } : null;
}

export const polar = (c: Point, r: number, angle: number): Point => ({
  x: c.x + r * Math.cos(angle),
  y: c.y + r * Math.sin(angle),
});

/** Field angle (degrees, counter-clockwise, 0 = right, 0 … 360) of a document vector. */
export function degFromVector(v: Point): number {
  const deg = (-Math.atan2(v.y, v.x) * 180) / Math.PI;
  const n = ((deg % 360) + 360) % 360;
  return n >= 360 - 1e-9 ? 0 : n;
}

/** Unit vector of a field angle (degrees counter-clockwise). */
export function vectorFromDeg(deg: number): Point {
  const a = (-deg * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Field degrees (counter-clockwise) → document angle (radians, atan2). */
export const docAngleFromDeg = (deg: number): number => (-deg * Math.PI) / 180;

/** The four corners of a rectangle, in order around it. */
export function rectCorners(r: { c: Point; w: number; h: number; angle: number }): Point[] {
  const u = { x: Math.cos(r.angle), y: Math.sin(r.angle) };
  const v = { x: -u.y, y: u.x };
  const hw = r.w / 2;
  const hh = r.h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([a, b]) => ({ x: r.c.x + u.x * a + v.x * b, y: r.c.y + u.y * a + v.y * b }));
}

/** A rectangle from one edge `a → b` and a signed height across it (positive = right side on screen). */
export function rectFromEdge(a: Point, b: Point, height: number) {
  const e = sub(b, a);
  const w = len(e);
  const angle = Math.atan2(e.y, e.x);
  const v = { x: -Math.sin(angle), y: Math.cos(angle) };
  const c = add(mid(a, b), scale(v, height / 2));
  return { c, w, h: Math.abs(height), angle };
}

/** Start and end point of an arc. */
export function arcEnds(a: { c: Point; r: number; start: number; sweep: number }) {
  return { start: polar(a.c, a.r, a.start), end: polar(a.c, a.r, a.start + a.sweep) };
}

/** The circle through three points; `null` if they are (nearly) on one line. */
export function circumcircle(a: Point, b: Point, c: Point): Circle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const scaleRef = Math.max(dist(a, b), dist(b, c), dist(a, c), 1);
  if (Math.abs(d) < 1e-9 * scaleRef * scaleRef) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const center = { x: cx, y: cy };
  return { c: center, r: dist(center, a) };
}

/** `a` shifted by whole turns to lie within (ref − π, ref + π]. */
export function nearestTurn(a: number, ref: number): number {
  let x = a;
  while (x - ref > Math.PI) x -= TAU;
  while (x - ref <= -Math.PI) x += TAU;
  return x;
}

/**
 * The arc from `s` to `e` on the circle through `s`, `via` and `e` that passes `via`; `null` for
 * collinear points.
 */
export function arcThrough(s: Point, via: Point, e: Point) {
  const circle = circumcircle(s, via, e);
  if (!circle) return null;
  const { c, r } = circle;
  const a0 = Math.atan2(s.y - c.y, s.x - c.x);
  const av = Math.atan2(via.y - c.y, via.x - c.x);
  const ae = Math.atan2(e.y - c.y, e.x - c.x);
  // clockwise (positive) sweep from start to end and to `via`
  const cw = (x: number) => (((x - a0) % TAU) + TAU) % TAU;
  const toEnd = cw(ae);
  const sweep = cw(av) < toEnd ? toEnd : toEnd - TAU;
  return { c, r, start: a0, sweep };
}

/**
 * The arc leaving `s` in direction `t` (unit) and ending at `e` (design 019 E8); `null` when `e`
 * lies on the tangent line (a straight continuation).
 */
export function tangentArc(s: Point, t: Point, e: Point) {
  const n = normal(t);
  const se = sub(e, s);
  const k = dot(n, se);
  if (Math.abs(k) < EPS * Math.max(1, len(se))) return null;
  const r = dot(se, se) / (2 * k);
  const c = add(s, scale(n, r));
  return arcFromCenterTangent(c, s, t, e);
}

/** The arc around `c` from `s` (leaving in direction `t`) to the angle of `e`. */
export function arcFromCenterTangent(c: Point, s: Point, t: Point, e: Point) {
  const r = dist(c, s);
  const start = Math.atan2(s.y - c.y, s.x - c.x);
  const end = Math.atan2(e.y - c.y, e.x - c.x);
  // direction of travel: clockwise (positive) when t is the clockwise tangent at s
  const cwTangent = { x: -Math.sin(start), y: Math.cos(start) };
  const cw = dot(cwTangent, t) >= 0;
  const d = (((end - start) % TAU) + TAU) % TAU;
  const sweep = cw ? d : d === 0 ? 0 : d - TAU;
  return { c, r, start, sweep };
}

/** A shape too small to draw (`min` = smallest length, document units): a double click, a 0 typed. */
export function isDegenerate(shape: SketchShape, min: number): boolean {
  switch (shape.kind) {
    case 'line':
      return dist(shape.a, shape.b) < min;
    case 'rect':
      return !(shape.w >= min && shape.h >= min);
    case 'circle':
      return !(shape.r >= min);
    case 'arc':
      return !(shape.r >= min) || Math.abs(shape.sweep) * shape.r < min;
  }
}
