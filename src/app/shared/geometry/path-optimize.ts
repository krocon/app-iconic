import { parsePath, PathSeg, withStarts } from './path-data';
import { countPoints, roundSegments, writeShortest } from './path-write';
import { Point } from './view-transform';

/**
 * The path optimizer (design 011 E10, E11). Taken over from the template's
 * `AppIconic/Sources/Utilities/SVGPathOptimizer.swift` (Marc's own code): Ramer-Douglas-Peucker
 * with corner protection (cosine < 0.98 is a corner, neighbours within radius 1 are kept),
 * duplicate points removed, numbers rounded, white space compressed. Unlike the template it
 *
 * - simplifies every run of straight lines, also in paths with curves (curves and arcs stay
 *   curves – flattening them like `CGPathSimplify.swift` would destroy them);
 * - rounds instead of truncating, with a selectable precision;
 * - leaves out only letters that are repeated implicitly (the template removed every `L` after
 *   the first one, also after a curve – turning the line into curve parameters);
 * - measures the distance to the segment, not to the infinite line (the error bound holds);
 * - writes each segment in the shortest form (`path-write.ts`).
 *
 * Pure: `d` in, `d` out (`null` for invalid path data – nothing is changed then).
 */

export const DEFAULT_EPSILON = 1;
export const DEFAULT_PRECISION = 3;
const MAX_PRECISION = 8;
const COS_CORNER = 0.98;
const CORNER_RADIUS = 1;

export interface OptimizeOptions {
  /** Largest deviation of a removed point (document units), default 1. */
  epsilon?: number;
  /** Decimals of the numbers, default 3. */
  precision?: number;
}

export interface OptimizeResult {
  d: string;
  pointsBefore: number;
  pointsAfter: number;
}

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
const isLine = (s: PathSeg) => s.cmd === 'L' || s.cmd === 'H' || s.cmd === 'V';

/** Distance of `p` to the segment `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-24) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Corners: direction changes with cosine below 0.98, neighbours within the radius included. */
function cornerFlags(points: readonly Point[]): boolean[] {
  const flags = points.map(() => false);
  for (let i = 1; i < points.length - 1; i++) {
    const v1 = { x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y };
    const v2 = { x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y };
    const l1 = Math.hypot(v1.x, v1.y);
    const l2 = Math.hypot(v2.x, v2.y);
    if (l1 <= 1e-9 || l2 <= 1e-9) continue;
    const dot = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)));
    if (dot >= COS_CORNER) continue;
    const lo = Math.max(0, i - CORNER_RADIUS);
    const hi = Math.min(points.length - 1, i + CORNER_RADIUS);
    for (let k = lo; k <= hi; k++) flags[k] = true;
  }
  return flags;
}

/**
 * Ramer-Douglas-Peucker with corner protection (template `ramerDouglasPeucker`): the ends and
 * every corner stay; between them a point stays if it is farther than `epsilon` from the chord.
 */
export function rdpWithCorners(points: readonly Point[], epsilon: number): Point[] {
  if (points.length < 3) return [...points];
  const corners = cornerFlags(points);
  const keep = corners.slice();
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    let forced = -1;
    for (let i = a + 1; i < b; i++) {
      if (corners[i]) {
        forced = i;
        break;
      }
    }
    if (forced >= 0) {
      stack.push([forced, b], [a, forced]);
      continue;
    }
    let max = 0;
    let at = a;
    for (let i = a + 1; i < b; i++) {
      const dist = distanceToSegment(points[i], points[a], points[b]);
      if (dist > max) {
        max = dist;
        at = i;
      }
    }
    if (max > epsilon) {
      keep[at] = true;
      stack.push([at, b], [a, at]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Drops segments that draw nothing (after rounding) and an `L` back to the start before `Z`. */
function dropNullSegments(input: readonly PathSeg[], precision: number): PathSeg[] {
  const rounded = roundSegments(input, precision);
  const out: PathSeg[] = [];
  input.forEach((seg, i) => {
    const r = rounded[i];
    const next = input[i + 1];
    if (seg.cmd === 'M') {
      // a moveto followed by another moveto (or nothing) starts nothing
      if (!next || next.cmd === 'M') return;
    } else if (seg.cmd !== 'Z') {
      const pts = [r.p, r.c1, r.c2].filter((p): p is Point => !!p);
      const empty = pts.every((p) => same(p, r.start));
      // a zero-length arc is not drawn; lines and curves without length neither
      if (empty) return;
      if (isLine(seg) && next?.cmd === 'Z' && same(r.p, rounded[i + 1].p)) return;
    }
    out.push({ ...seg, implicit: false });
  });
  return withStarts(out);
}

function line(start: Point, p: Point): PathSeg {
  return { cmd: 'L', rel: false, implicit: false, start, p };
}

/** Every run of straight lines simplified with RDP (its ends stay, design 011 E10). */
function simplifyRuns(input: readonly PathSeg[], epsilon: number): PathSeg[] {
  const out: PathSeg[] = [];
  let i = 0;
  while (i < input.length) {
    if (!isLine(input[i])) {
      out.push(input[i++]);
      continue;
    }
    const pts: Point[] = [input[i].start];
    while (i < input.length && isLine(input[i])) pts.push(input[i++].p);
    const kept = rdpWithCorners(pts, epsilon);
    for (let k = 1; k < kept.length; k++) out.push(line(kept[k - 1], kept[k]));
  }
  return withStarts(out);
}

function clampOptions(opts: OptimizeOptions): { epsilon: number; precision: number } {
  const e = opts.epsilon ?? DEFAULT_EPSILON;
  const p = opts.precision ?? DEFAULT_PRECISION;
  return {
    epsilon: Number.isFinite(e) && e > 0 ? e : 0,
    precision: Number.isInteger(p) ? Math.max(0, Math.min(MAX_PRECISION, p)) : DEFAULT_PRECISION,
  };
}

/** Optimizes `d`; `null` if it is not valid path data. */
export function optimizePath(d: string, opts: OptimizeOptions = {}): OptimizeResult | null {
  const segs = parsePath(d);
  if (!segs) return null;
  const { epsilon, precision } = clampOptions(opts);
  // the template's duplicate removal happens on the rounded points (what is written)
  const cleaned = dropNullSegments(segs, precision);
  const simplified = simplifyRuns(cleaned, epsilon);
  // removing points can make segments empty after rounding again
  const final = dropNullSegments(simplified, precision);
  return {
    d: final.length ? writeShortest(final, precision) : d.trim(),
    pointsBefore: countPoints(segs),
    pointsAfter: final.length ? countPoints(final) : countPoints(segs),
  };
}
