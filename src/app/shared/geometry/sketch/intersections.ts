import { Point } from '../view-transform';

/**
 * Where the outlines of shapes cross ("intersect", like the Smart Guides of Marc's VectorCraft,
 * `crates/tools/src/guides/targets.rs` `crossing`): exact for straight edges and circles, the two
 * kinds the sketch targets give (design 019 E10). Document units. Pure.
 */

export type Outline =
  { kind: 'segment'; a: Point; b: Point } | { kind: 'circle'; c: Point; r: number };

/** One outline of one shape (`owner`: where two edges of one shape meet is its corner – no news). */
export interface OwnedOutline {
  owner: string;
  outline: Outline;
}

/** Most crossings collected (huge imported icons). */
export const MAX_CROSSINGS = 20_000;
/** Most pairs looked at. */
export const MAX_PAIRS = 400_000;

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
  return [];
}

/** `x` is an end of a segment (rounding-tolerant). */
function atEnd(x: Point, o: Outline): boolean {
  if (o.kind !== 'segment') return false;
  const tol = 1e-7 * Math.max(1, Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y));
  return Math.hypot(x.x - o.a.x, x.y - o.a.y) <= tol || Math.hypot(x.x - o.b.x, x.y - o.b.y) <= tol;
}

function bounds(o: Outline): { x0: number; y0: number; x1: number; y1: number } {
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
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    for (let j = i + 1; j < items.length && items[j].b.x0 <= p.b.x1 + EPS; j++) {
      const q = items[j];
      if (q.b.y0 > p.b.y1 + EPS || q.b.y1 < p.b.y0 - EPS) continue;
      if (++pairs > MAX_PAIRS) return out;
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
