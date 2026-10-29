import { PenAnchor } from './pen/pen-path';
import { Point } from './view-transform';

/**
 * Live Corners (prompt 045; behaviour of Marc's VectorCraft `geom/src/corners.rs` and
 * `tools/src/corners.rs`): the corners of a polygon / straight path where two straight sides meet
 * at an angle, cut round, inverted round or chamfered with one radius. Local units. Pure.
 */

export type CornerKind = 'round' | 'inverted' | 'chamfer';
export const CORNER_KINDS: readonly CornerKind[] = ['round', 'inverted', 'chamfer'];

export interface Corner {
  index: number;
  at: Point;
  /** Unit directions towards the previous and the next point. */
  u: Point;
  v: Point;
  lu: number;
  lv: number;
  /** The angle between the sides (0 … π). */
  theta: number;
}

/** Sides closer than this to straight on make no corner (sine of their angle). */
const MIN_SINE = 1e-6;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const len = (a: Point) => Math.hypot(a.x, a.y);
const unit = (a: Point): Point | null => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : null;
};

/** The corners of the polygon `points` (closed or open: an open one's ends are none). */
export function cornersOf(points: readonly Point[], closed: boolean): Corner[] {
  const n = points.length;
  const out: Corner[] = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const at = points[i];
    const u = unit(sub(prev, at));
    const v = unit(sub(next, at));
    if (!u || !v) continue;
    const sin = Math.abs(u.x * v.y - u.y * v.x);
    if (sin <= MIN_SINE) continue;
    const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    out.push({ index: i, at, u, v, lu: len(sub(prev, at)), lv: len(sub(next, at)), theta });
  }
  return out;
}

/** How far along each side a radius `r` cuts (round: the tangent points). */
export function cutLength(c: Corner, r: number): number {
  return r / Math.tan(c.theta / 2);
}

/** The largest radius a corner takes: its cuts at most half of each side. */
export function maxRadius(c: Corner): number {
  return (Math.min(c.lu, c.lv) / 2) * Math.tan(c.theta / 2);
}

/** The radius the widget of `c` dragged to `p` asks for (along the corner's bisector). */
export function radiusAt(c: Corner, p: Point): number {
  const b = unit(add(c.u, c.v));
  if (!b) return 0;
  const d = (p.x - c.at.x) * b.x + (p.y - c.at.y) * b.y;
  // the widget of a round corner sits at the arc's centre: d = r / sin(θ/2)
  return Math.max(0, Math.min(maxRadius(c), d * Math.sin(c.theta / 2)));
}

/**
 * Where the widget of `c` sits for radius `r`: the arc's centre, at least `minDist` inside the
 * corner along its bisector (VectorCraft: a few screen pixels).
 */
export function widgetAt(c: Corner, r: number, minDist: number): Point {
  const b = unit(add(c.u, c.v)) ?? { x: 0, y: 0 };
  const d = Math.max(minDist, Math.min(r, maxRadius(c)) / Math.sin(c.theta / 2));
  return add(c.at, mul(b, d));
}

/** The polygon with every corner cut by `r` (clamped per corner) as anchors of one subpath. */
export function cutCorners(
  points: readonly Point[],
  closed: boolean,
  r: number,
  kind: CornerKind,
): PenAnchor[] {
  const corners = new Map(cornersOf(points, closed).map((c) => [c.index, c]));
  const out: PenAnchor[] = [];
  points.forEach((p, i) => {
    const c = corners.get(i);
    const rr = c ? Math.min(r, maxRadius(c)) : 0;
    if (!c || !(rr > 1e-9)) {
      out.push({ p, hin: null, hout: null });
      return;
    }
    const t = cutLength(c, rr);
    const a = add(c.at, mul(c.u, t));
    const b = add(c.at, mul(c.v, t));
    if (kind === 'chamfer') {
      out.push({ p: a, hin: null, hout: null }, { p: b, hin: null, hout: null });
      return;
    }
    if (kind === 'round') {
      // the arc turns by π − θ; its handles point at the corner
      const h = (4 / 3) * Math.tan((Math.PI - c.theta) / 4) * rr;
      out.push(
        { p: a, hin: null, hout: sub(a, mul(c.u, h)) },
        { p: b, hin: sub(b, mul(c.v, h)), hout: null },
      );
      return;
    }
    // inverted: an arc around the corner with radius t, bulging inwards
    const h = (4 / 3) * Math.tan(c.theta / 4) * t;
    const wa = unit(sub(c.v, mul(c.u, c.u.x * c.v.x + c.u.y * c.v.y))) ?? c.v;
    const wb = unit(sub(c.u, mul(c.v, c.u.x * c.v.x + c.u.y * c.v.y))) ?? c.u;
    out.push(
      { p: a, hin: null, hout: add(a, mul(wa, h)) },
      { p: b, hin: add(b, mul(wb, h)), hout: null },
    );
  });
  return out;
}
