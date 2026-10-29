import { Point } from '../view-transform';
import { Curve, curveCrossings, nearestOnCurve, Param, samples } from './outline-curves';

/**
 * Where the outlines of shapes cross ("intersect", like the Smart Guides of Marc's VectorCraft,
 * `crates/tools/src/guides/targets.rs` `crossing`): exact for straight edges and circles, settled
 * with Newton's method where a curve takes part (ellipses, Bézier and elliptic arcs, prompt 040).
 * Document units. Pure.
 */

export type Outline =
  { kind: 'segment'; a: Point; b: Point } | { kind: 'circle'; c: Point; r: number } | Curve;

/** An outline as a function of `t ∈ [0, 1]` with its sample count. */
function asParam(o: Outline): { at: Param; n: number; closed?: boolean } {
  if (o.kind === 'curve') return o;
  if (o.kind === 'segment') {
    return {
      at: (t) => ({ x: o.a.x + (o.b.x - o.a.x) * t, y: o.a.y + (o.b.y - o.a.y) * t }),
      n: 1,
    };
  }
  return {
    at: (t) => ({
      x: o.c.x + o.r * Math.cos(2 * Math.PI * t),
      y: o.c.y + o.r * Math.sin(2 * Math.PI * t),
    }),
    n: 64,
    closed: true,
  };
}

/** The point of an outline nearest to `p`. */
export function nearestOn(o: Outline, p: Point): Point {
  if (o.kind === 'segment') {
    const d = { x: o.b.x - o.a.x, y: o.b.y - o.a.y };
    const l2 = d.x * d.x + d.y * d.y;
    const k =
      l2 > EPS ? Math.max(0, Math.min(1, ((p.x - o.a.x) * d.x + (p.y - o.a.y) * d.y) / l2)) : 0;
    return { x: o.a.x + d.x * k, y: o.a.y + d.y * k };
  }
  if (o.kind === 'circle') {
    const v = { x: p.x - o.c.x, y: p.y - o.c.y };
    const l = Math.hypot(v.x, v.y);
    if (l <= EPS) return { x: o.c.x + o.r, y: o.c.y };
    return { x: o.c.x + (v.x / l) * o.r, y: o.c.y + (v.y / l) * o.r };
  }
  return nearestOnCurve(o, p);
}

/** One outline of one shape (`owner`: where two edges of one shape meet is its corner – no news). */
export interface OwnedOutline {
  owner: string;
  outline: Outline;
}

/** Most crossings collected (huge imported icons). */
export const MAX_CROSSINGS = 20_000;
/** Most work for all crossings: pairs looked at, and sample segments compared for curves. */
export const MAX_WORK = 2_000_000;

const EPS = 1e-9;

function segSeg(a: Point, b: Point, c: Point, d: Point): Point[] {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  const scale = Math.max(Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y), EPS);
  if (Math.abs(den) <= 1e-12 * scale) return []; // parallel (overlaps have no single point)
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / den;
  const u = (q.x * r.y - q.y * r.x) / den;
  const tol = 1e-9;
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return [];
  return [{ x: a.x + r.x * t, y: a.y + r.y * t }];
}

function segCircle(a: Point, b: Point, c: Point, rad: number): Point[] {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const f = { x: a.x - c.x, y: a.y - c.y };
  const A = d.x * d.x + d.y * d.y;
  if (A <= EPS) return [];
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - rad * rad;
  let disc = B * B - 4 * A * C;
  // a tangent touches in one point (rounding may make it slightly negative)
  if (disc < 0 && disc > -1e-9 * B * B) disc = 0;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  const ts = disc === 0 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return ts
    .filter((t) => t >= -1e-9 && t <= 1 + 1e-9)
    .map((t) => ({ x: a.x + d.x * t, y: a.y + d.y * t }));
}

function circleCircle(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d <= EPS || d > r1 + r2 + 1e-9 * (r1 + r2) || d < Math.abs(r1 - r2) - 1e-9 * (r1 + r2)) {
    return [];
  }
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m = { x: c1.x + (a * dx) / d, y: c1.y + (a * dy) / d };
  if (h <= 1e-9 * Math.max(r1, r2)) return [m];
  return [
    { x: m.x + (h * dy) / d, y: m.y - (h * dx) / d },
    { x: m.x - (h * dy) / d, y: m.y + (h * dx) / d },
  ];
}

/** Where two outlines cross. */
export function intersect(p: Outline, q: Outline): Point[] {
  if (p.kind === 'segment' && q.kind === 'segment') return segSeg(p.a, p.b, q.a, q.b);
  if (p.kind === 'segment' && q.kind === 'circle') return segCircle(p.a, p.b, q.c, q.r);
  if (p.kind === 'circle' && q.kind === 'segment') return segCircle(q.a, q.b, p.c, p.r);
  if (p.kind === 'circle' && q.kind === 'circle') return circleCircle(p.c, p.r, q.c, q.r);
  return curveCrossings(asParam(p), asParam(q));
}

/** `x` is an end of a segment (rounding-tolerant). */
function atEnd(x: Point, o: Outline): boolean {
  if (o.kind !== 'segment') return false;
  const tol = 1e-7 * Math.max(1, Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y));
  return Math.hypot(x.x - o.a.x, x.y - o.a.y) <= tol || Math.hypot(x.x - o.b.x, x.y - o.b.y) <= tol;
}

const boxes = new WeakMap<object, { x0: number; y0: number; x1: number; y1: number }>();

/** The bounds of an outline (kept per outline object). */
export function outlineBounds(o: Outline): { x0: number; y0: number; x1: number; y1: number } {
  const known = boxes.get(o);
  if (known) return known;
  const b = bounds(o);
  boxes.set(o, b);
  return b;
}

function bounds(o: Outline): { x0: number; y0: number; x1: number; y1: number } {
  if (o.kind === 'curve') {
    const ps = samples(o);
    const x0 = Math.min(...ps.map((q) => q.x));
    const y0 = Math.min(...ps.map((q) => q.y));
    const x1 = Math.max(...ps.map((q) => q.x));
    const y1 = Math.max(...ps.map((q) => q.y));
    // the curve bulges past its samples a little
    const pad = 0.02 * Math.max(x1 - x0, y1 - y0) + 1e-6;
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }
  if (o.kind === 'circle') {
    return { x0: o.c.x - o.r, y0: o.c.y - o.r, x1: o.c.x + o.r, y1: o.c.y + o.r };
  }
  return {
    x0: Math.min(o.a.x, o.b.x),
    y0: Math.min(o.a.y, o.b.y),
    x1: Math.max(o.a.x, o.b.x),
    y1: Math.max(o.a.y, o.b.y),
  };
}

/**
 * Where the outlines of different shapes cross: sweep along x over their bounds, so only pairs
 * whose bounds overlap are tried (at most `MAX_PAIRS`, `MAX_CROSSINGS` points).
 */
export function crossings(all: readonly OwnedOutline[]): Point[] {
  const items = all
    .map((o) => ({ ...o, b: bounds(o.outline) }))
    .filter((o) => [o.b.x0, o.b.y0, o.b.x1, o.b.y1].every(Number.isFinite))
    .sort((p, q) => p.b.x0 - q.b.x0);
  const out: Point[] = [];
  // every pair in reach costs, a curve pair as many as the sample segments it compares
  const cost = (o: Outline) => (o.kind === 'curve' ? o.n : o.kind === 'circle' ? 64 : 1);
  let work = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    for (let j = i + 1; j < items.length && items[j].b.x0 <= p.b.x1 + EPS; j++) {
      if (++work > MAX_WORK) return out;
      const q = items[j];
      if (q.b.y0 > p.b.y1 + EPS || q.b.y1 < p.b.y0 - EPS) continue;
      const curved = p.outline.kind === 'curve' || q.outline.kind === 'curve';
      if (curved && (work += cost(p.outline) * cost(q.outline)) > MAX_WORK) return out;
      const same = q.owner === p.owner;
      for (const x of intersect(p.outline, q.outline)) {
        // two edges of one shape meet at its corners: those are its points already
        if (same && (atEnd(x, p.outline) || atEnd(x, q.outline))) continue;
        out.push(x);
        if (out.length >= MAX_CROSSINGS) return out;
      }
    }
  }
  return out;
}
