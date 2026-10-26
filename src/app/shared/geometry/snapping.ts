import { CANVAS_SIZE } from './icon-guides';
import { Point } from './view-transform';

/**
 * Snapping (design 007 E13; taken over from the template's `SnappingService.swift` and
 * `GridSnapper`, Marc's own code): grid (spacing 10, origin `worldZero` or `svgCenter`) and magic
 * snap on marked points of the document. The activation distance is measured in SCREEN pixels
 * (document distance × zoom), so it feels the same at every zoom; on a tie magic wins. Pure.
 */

export type SnapKind = 'none' | 'grid' | 'magic';
export type GridOrigin = 'worldZero' | 'svgCenter';

/** Activation distance in screen pixels (legacy §6). */
export const SNAP_TOLERANCE_PX = 20;
export const GRID_STEP = 10;

export interface SnapOptions {
  zoom: number;
  grid: boolean;
  magic: boolean;
  step?: number;
  origin?: Point;
  tolerancePx?: number;
}

export interface SnapResult {
  point: Point;
  kind: SnapKind;
  /** The point snapped to (for the indicator), `null` without snap. */
  target: Point | null;
  /** Screen distance to the target (`Infinity` without snap). */
  distancePx: number;
}

export function gridOriginPoint(origin: GridOrigin): Point {
  return origin === 'svgCenter' ? { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 } : { x: 0, y: 0 };
}

/** The nearest grid crossing (`GridSnapper.snap`). */
export function gridSnap(p: Point, origin: Point, step: number): Point {
  const s = Math.max(step, 1e-6);
  const r = (v: number, o: number) => Math.round((v - o) / s) * s + o;
  return { x: r(p.x, origin.x), y: r(p.y, origin.y) };
}

const NONE = (p: Point): SnapResult => ({
  point: p,
  kind: 'none',
  target: null,
  distancePx: Infinity,
});

/** Snaps one point: the nearest magic candidate and the grid crossing within the tolerance. */
export function snapPoint(p: Point, candidates: readonly Point[], o: SnapOptions): SnapResult {
  const tol = o.tolerancePx ?? SNAP_TOLERANCE_PX;
  const z = o.zoom > 0 ? o.zoom : 1;
  const dist = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) * z;
  let best = NONE(p);
  if (o.magic) {
    for (const c of candidates) {
      const d = dist(c);
      if (d <= tol && d < best.distancePx)
        best = { point: c, kind: 'magic', target: c, distancePx: d };
    }
  }
  if (o.grid) {
    const g = gridSnap(p, o.origin ?? { x: 0, y: 0 }, o.step ?? GRID_STEP);
    const d = dist(g);
    // on a tie magic wins (`magic.distance <= grid.distance`)
    if (d <= tol && d < best.distancePx)
      best = { point: g, kind: 'grid', target: g, distancePx: d };
  }
  return best;
}

/**
 * Snaps a move: every key point of the moved selection (`keyPoints + delta`) is tried, the one
 * nearest to a snap target decides; the delta is corrected by its offset.
 */
export function snapMove(
  keyPoints: readonly Point[],
  delta: Point,
  candidates: readonly Point[],
  o: SnapOptions,
): { delta: Point; kind: SnapKind; target: Point | null } {
  let best: { r: SnapResult; from: Point } | null = null;
  for (const k of keyPoints) {
    const moved = { x: k.x + delta.x, y: k.y + delta.y };
    const r = snapPoint(moved, candidates, o);
    if (r.kind !== 'none' && (!best || r.distancePx < best.r.distancePx)) best = { r, from: moved };
  }
  if (!best) return { delta, kind: 'none', target: null };
  return {
    delta: {
      x: delta.x + best.r.point.x - best.from.x,
      y: delta.y + best.r.point.y - best.from.y,
    },
    kind: best.r.kind,
    target: best.r.target,
  };
}
