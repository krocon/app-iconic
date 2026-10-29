import { CANVAS_SIZE } from './icon-guides';
import { GuideTag, SmartScene, smartSnap } from './smart-guides';
import { Point } from './view-transform';

/**
 * Snapping (design 007 E13; taken over from the template's `SnappingService.swift` and
 * `GridSnapper`, Marc's own code): grid (spacing 10, origin `worldZero` or `svgCenter`) and magic
 * snap on marked points of the document. The activation distance is measured in SCREEN pixels
 * (document distance × zoom), so it feels the same at every zoom; on a tie magic wins. With Magic
 * Snap the point also lines up with the marked points ("align", like the Smart Guides of Marc's
 * VectorCraft, `crates/tools/src/guides/targets.rs`): each axis takes the x / y of the nearest
 * marked point within a few pixels, and guide lines run from those points. Pure.
 */

export type SnapKind = 'none' | 'grid' | 'magic' | 'align' | 'guide';
export type GridOrigin = 'worldZero' | 'svgCenter';

/** Activation distance in screen pixels (legacy §6). */
export const SNAP_TOLERANCE_PX = 20;
export const GRID_STEP = 10;
/** Tangent, perpendicular, on a path, construction guides: closer than this (screen px). */
export const SMART_TOLERANCE_PX = 8;

/** Lining up with a marked point: closer than this in screen pixels on one axis (VectorCraft: a few px). */
export const ALIGN_TOLERANCE_PX = 6;

/** What a marked point is, when the indicator names it (VectorCraft's labels). */
export type SnapTag = 'intersect' | 'anchor' | 'center' | GuideTag;

/** A marked point of Magic Snap, optionally named. */
export type SnapCandidate = Point & { tag?: SnapTag };

/** A guide line of "align": from the marked point to where the point landed (document units). */
export interface SnapGuide {
  from: Point;
  to: Point;
}

export interface SnapOptions {
  zoom: number;
  grid: boolean;
  magic: boolean;
  step?: number;
  origin?: Point;
  tolerancePx?: number;
  /** Outlines, the point drawn from, extensions: the Smart Guides of prompt 040. */
  scene?: SmartScene;
  /** Use the scene (default: with Magic Snap). */
  smart?: boolean;
  /** Line up with the marked points (default: with Magic Snap). */
  align?: boolean;
  alignTolerancePx?: number;
}

export interface SnapResult {
  point: Point;
  kind: SnapKind;
  /** The point snapped to (for the indicator), `null` without snap. */
  target: Point | null;
  /** Screen distance to the target (`Infinity` without snap). */
  distancePx: number;
  /** The guide lines of "align" (empty otherwise). */
  guides: SnapGuide[];
  /** What the marked point snapped to is ("intersect"), if it is named. */
  tag?: SnapTag;
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
  guides: [],
});

/** The marked point nearest to `p` along one axis within `tol` (document units); on a tie the nearest overall. */
function nearestOnAxis(
  p: Point,
  candidates: readonly SnapCandidate[],
  axis: 'x' | 'y',
  tol: number,
) {
  let best: Point | null = null;
  let bestD = Infinity;
  let bestAll = Infinity;
  for (const c of candidates) {
    // crossings are places to land on, not lines to keep to (too many, by chance)
    if (c.tag === 'intersect') continue;
    const d = Math.abs(c[axis] - p[axis]);
    if (d > tol) continue;
    const all = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && all < bestAll)) {
      best = c;
      bestD = d;
      bestAll = all;
    }
  }
  return best ? { c: best, d: bestD } : null;
}

/** "align": each axis on the x / y of the nearest marked point; the other axis on the grid. */
function alignPoint(
  p: Point,
  candidates: readonly SnapCandidate[],
  o: SnapOptions,
): SnapResult | null {
  const z = o.zoom > 0 ? o.zoom : 1;
  const tol = (o.alignTolerancePx ?? ALIGN_TOLERANCE_PX) / z;
  const ax = nearestOnAxis(p, candidates, 'x', tol);
  const ay = nearestOnAxis(p, candidates, 'y', tol);
  if (!ax && !ay) return null;
  const grid = o.grid ? gridSnap(p, o.origin ?? { x: 0, y: 0 }, o.step ?? GRID_STEP) : null;
  const gridTol = (o.tolerancePx ?? SNAP_TOLERANCE_PX) / z;
  const free = (axis: 'x' | 'y') =>
    grid && Math.abs(grid[axis] - p[axis]) <= gridTol ? grid[axis] : p[axis];
  const point = { x: ax ? ax.c.x : free('x'), y: ay ? ay.c.y : free('y') };
  const guides: SnapGuide[] = [];
  if (ax) guides.push({ from: ax.c, to: point });
  if (ay) guides.push({ from: ay.c, to: point });
  const d = Math.min(ax?.d ?? Infinity, ay?.d ?? Infinity) * z;
  return { point, kind: 'align', target: point, distancePx: d, guides };
}

/** Snaps one point: the nearest magic candidate and the grid crossing within the tolerance. */
export function snapPoint(
  p: Point,
  candidates: readonly SnapCandidate[],
  o: SnapOptions,
): SnapResult {
  const tol = o.tolerancePx ?? SNAP_TOLERANCE_PX;
  const z = o.zoom > 0 ? o.zoom : 1;
  const dist = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) * z;
  let best = NONE(p);
  if (o.magic) {
    for (const c of candidates) {
      const d = dist(c);
      if (d <= tol && d < best.distancePx)
        best = {
          point: { x: c.x, y: c.y },
          kind: 'magic',
          target: { x: c.x, y: c.y },
          distancePx: d,
          guides: [],
          tag: c.tag,
        };
    }
  }

  if (o.grid) {
    const g = gridSnap(p, o.origin ?? { x: 0, y: 0 }, o.step ?? GRID_STEP);
    const d = dist(g);
    // on a tie magic wins (`magic.distance <= grid.distance`)
    if (d <= tol && d < best.distancePx)
      best = { point: g, kind: 'grid', target: g, distancePx: d, guides: [] };
  }
  if (best.kind === 'magic') return best;
  if (o.scene && (o.smart ?? o.magic)) {
    const lines = candidates.filter((c) => c.tag !== 'intersect');
    const hit = smartSnap(
      p,
      o.scene,
      SMART_TOLERANCE_PX / z,
      lines,
      (o.alignTolerancePx ?? ALIGN_TOLERANCE_PX) / z,
    );
    if (hit) {
      return {
        point: hit.point,
        kind: 'guide',
        target: hit.point,
        distancePx: hit.distance * z,
        guides: hit.guides,
        tag: hit.tag,
      };
    }
  }
  // lining up beats the grid (it is what the pointer is near on purpose; the other axis keeps it)
  const aligned = (o.align ?? o.magic) ? alignPoint(p, candidates, o) : null;
  return aligned ?? best;
}

/**
 * Snaps a move: every key point of the moved selection (`keyPoints + delta`) is tried, the one
 * nearest to a snap target decides; the delta is corrected by its offset.
 */
export function snapMove(
  keyPoints: readonly Point[],
  delta: Point,
  candidates: readonly SnapCandidate[],
  o: SnapOptions,
): { delta: Point; kind: SnapKind; target: Point | null; guides: SnapGuide[]; tag?: SnapTag } {
  let best: { r: SnapResult; from: Point } | null = null;
  for (const k of keyPoints) {
    const moved = { x: k.x + delta.x, y: k.y + delta.y };
    const r = snapPoint(moved, candidates, o);
    if (r.kind !== 'none' && (!best || r.distancePx < best.r.distancePx)) best = { r, from: moved };
  }
  if (!best) return { delta, kind: 'none', target: null, guides: [] };
  return {
    delta: {
      x: delta.x + best.r.point.x - best.from.x,
      y: delta.y + best.r.point.y - best.from.y,
    },
    kind: best.r.kind,
    target: best.r.target,
    guides: best.r.guides,
    tag: best.r.tag,
  };
}
