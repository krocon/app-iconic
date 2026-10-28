import { Point } from '../view-transform';
import { add, dist, dot, mid, scale, SketchShape, sub, unit } from './sketch-shapes';

/**
 * Regular polygons of the sketch tools like Fusion's "Polygon" submenu: around a centre
 * (circumscribed – the pointer is the middle of an edge; inscribed – the pointer is a corner) or
 * on an edge (two corners and the side). Document units. Pure.
 */

/** Sides before anything is typed (Fusion's default). */
export const DEFAULT_SIDES = 6;
export const MIN_SIDES = 3;
export const MAX_SIDES = 64;

/** A usable number of sides: a whole number from 3 to 64. */
export function validSides(v: number): boolean {
  return Number.isInteger(v) && v >= MIN_SIDES && v <= MAX_SIDES;
}

/** The sides typed, else `fallback` (the last ones used), else 6. */
export function sidesOf(v: number | undefined, fallback = DEFAULT_SIDES): number {
  if (v !== undefined && validSides(v)) return v;
  return validSides(fallback) ? fallback : DEFAULT_SIDES;
}

/**
 * The polygon around `c` whose edge middle (`circumscribed`) or corner (`inscribed`) is `p`.
 * `null` when `p` is the centre.
 */
export function polygonAround(
  c: Point,
  p: Point,
  sides: number,
  mode: 'circumscribed' | 'inscribed',
): SketchShape | null {
  const d = dist(c, p);
  if (!(d > 0)) return null;
  const toward = Math.atan2(p.y - c.y, p.x - c.x);
  const half = Math.PI / sides;
  return mode === 'inscribed'
    ? { kind: 'polygon', c, r: d, sides, angle: toward, guide: 'outer' }
    : { kind: 'polygon', c, r: d / Math.cos(half), sides, angle: toward + half, guide: 'inner' };
}

/**
 * The polygon with the edge `a → b` on the side of `p` (no `p`, or `p` on the edge's line: the
 * right side on screen). `null` for a zero edge.
 */
export function polygonOnEdge(a: Point, b: Point, sides: number, p?: Point): SketchShape | null {
  const e = unit(sub(b, a));
  if (!e) return null;
  const n = { x: -e.y, y: e.x };
  const side = p && dot(n, sub(p, a)) < 0 ? -1 : 1;
  const length = dist(a, b);
  const half = Math.PI / sides;
  const c = add(mid(a, b), scale(n, (side * length) / (2 * Math.tan(half))));
  return {
    kind: 'polygon',
    c,
    r: length / (2 * Math.sin(half)),
    sides,
    angle: Math.atan2(a.y - c.y, a.x - c.x),
  };
}
