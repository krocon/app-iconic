// Verhalten nach Marcs VectorCraft, crates/tools/src/dimension.rs und xform/measure.rs
// (MIT/Apache), Prompt 048.
import { Point } from './view-transform';

/**
 * Measure and Dimension (prompt 048): the values the Measure tool shows and the geometry of the
 * dimensions the Dimension tool draws – linear (aligned with the measured points), radial (radius
 * or diameter) and angular. Document units, y down; angles as on screen (counter-clockwise
 * positive, 0° = right). Pure.
 */

export interface Measurement {
  distance: number;
  /** Degrees, −180 … 180, counter-clockwise on screen. */
  angle: number;
  dx: number;
  dy: number;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const len = (a: Point) => Math.hypot(a.x, a.y);
const DEG = 180 / Math.PI;

export function measure(a: Point, b: Point): Measurement {
  const d = sub(b, a);
  const angle = len(d) > 0 ? Math.atan2(-d.y, d.x) * DEG : 0;
  return { distance: len(d), angle: angle === -180 ? 180 : angle, dx: d.x, dy: d.y };
}

/** A number as a dimension shows it: one decimal, no trailing `.0`, no `-0`. */
export function formatValue(v: number, digits = 1): string {
  const k = 10 ** digits;
  const r = Math.round(v * k) / k;
  return String(Object.is(r, -0) ? 0 : r);
}

export type DimensionKind = 'linear' | 'radius' | 'diameter' | 'angle';

/** What a dimension draws: lines, an optional arc and the label (rotation in degrees, readable). */
export interface DimensionShape {
  kind: DimensionKind;
  value: number;
  text: string;
  lines: [Point, Point][];
  /** The arrow tips (where the dimension line ends) and the direction they point in. */
  tips: { at: Point; dir: Point }[];
  arc?: { c: Point; r: number; from: number; sweep: number };
  label: Point;
  rotate: number;
}

/** Keeps the label upright: a rotation in (−90°, 90°]. */
function readable(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 90 && r <= 270) r -= 180;
  if (r > 270) r -= 360;
  return r;
}

/**
 * A linear dimension of `a`–`b` placed through `at`: extension lines from the points to the
 * dimension line parallel to `a`–`b` at the signed distance of `at`; `gap` = label's distance.
 */
export function linearDimension(a: Point, b: Point, at: Point, gap = 0): DimensionShape | null {
  const d = sub(b, a);
  const l = len(d);
  if (!(l > 1e-9)) return null;
  const u = mul(d, 1 / l);
  const n = { x: -u.y, y: u.x };
  const off = (at.x - a.x) * n.x + (at.y - a.y) * n.y;
  const a2 = add(a, mul(n, off));
  const b2 = add(b, mul(n, off));
  const over = Math.sign(off || 1) * Math.min(Math.abs(off), 1e9);
  const ext = mul(n, over === 0 ? 0 : Math.sign(over) * gap);
  const rotate = readable(Math.atan2(u.y, u.x) * DEG);
  return {
    kind: 'linear',
    value: l,
    text: formatValue(l),
    lines: [
      [a, add(a2, ext)],
      [b, add(b2, ext)],
      [a2, b2],
    ],
    tips: [
      { at: a2, dir: mul(u, -1) },
      { at: b2, dir: u },
    ],
    label: add(mul(add(a2, b2), 0.5), mul(n, Math.sign(off || 1) * gap)),
    rotate,
  };
}

/** A radial dimension of the circle `c`, `r` towards `at`: radius from the centre, diameter across. */
export function radialDimension(
  c: Point,
  r: number,
  at: Point,
  diameter: boolean,
): DimensionShape | null {
  if (!(r > 1e-9)) return null;
  const d = sub(at, c);
  const u = len(d) > 1e-9 ? mul(d, 1 / len(d)) : { x: 1, y: 0 };
  const edge = add(c, mul(u, r));
  const start = diameter ? sub(c, mul(u, r)) : c;
  const outside = len(d) > r;
  const end = outside ? at : edge;
  const value = diameter ? 2 * r : r;
  return {
    kind: diameter ? 'diameter' : 'radius',
    value,
    text: `${diameter ? '⌀' : 'R'}${formatValue(value)}`,
    lines: [[start, end]],
    tips: [{ at: edge, dir: u }, ...(diameter ? [{ at: start, dir: mul(u, -1) }] : [])],
    label: outside ? at : add(c, mul(u, diameter ? 0 : r / 2)),
    rotate: readable(Math.atan2(u.y, u.x) * DEG),
  };
}

/**
 * An angular dimension at the corner `v` between the rays to `p1` and `p2` (the smaller angle),
 * its arc through the distance of `at` from the corner.
 */
export function angleDimension(v: Point, p1: Point, p2: Point, at: Point): DimensionShape | null {
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
  if (len(sub(p1, v)) < 1e-9 || len(sub(p2, v)) < 1e-9) return null;
  let sweep = a2 - a1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  const r = Math.max(len(sub(at, v)), 1e-6);
  const mid = a1 + sweep / 2;
  const value = Math.abs(sweep) * DEG;
  const pt = (a: number) => ({ x: v.x + r * Math.cos(a), y: v.y + r * Math.sin(a) });
  const s = Math.sign(sweep) || 1;
  return {
    kind: 'angle',
    value,
    text: `${formatValue(value)}°`,
    lines: [],
    tips: [
      { at: pt(a1), dir: { x: Math.sin(a1) * s, y: -Math.cos(a1) * s } },
      { at: pt(a1 + sweep), dir: { x: -Math.sin(a1 + sweep) * s, y: Math.cos(a1 + sweep) * s } },
    ],
    arc: { c: v, r, from: a1, sweep },
    label: { x: v.x + (r + 0) * Math.cos(mid), y: v.y + r * Math.sin(mid) },
    rotate: readable(mid * DEG + 90),
  };
}

/** The arc of a dimension as path data (`A`), for the overlay and the document. */
export function arcPath(
  arc: NonNullable<DimensionShape['arc']>,
  map: (p: Point) => Point = (p) => p,
): string {
  const { c, r, from, sweep } = arc;
  const p0 = map({ x: c.x + r * Math.cos(from), y: c.y + r * Math.sin(from) });
  const p1 = map({ x: c.x + r * Math.cos(from + sweep), y: c.y + r * Math.sin(from + sweep) });
  const rr = len(sub(map({ x: c.x + r, y: c.y }), map(c)));
  return `M ${p0.x} ${p0.y} A ${rr} ${rr} 0 0 ${sweep > 0 ? 1 : 0} ${p1.x} ${p1.y}`;
}
