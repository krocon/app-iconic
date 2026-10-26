import { Rect } from './dom-geometry';
import { CANVAS_SIZE } from './icon-guides';
import { Point } from './view-transform';

/**
 * BoundsGuard (design 007 E14; taken over from the template's `BoundsGuard.swift`): points, paths
 * and translations stay inside the canvas. Pure. A box that already lies partly outside (or is
 * larger than the canvas) is allowed the union of canvas and itself per axis, so nothing jumps.
 */

export const CANVAS_BOUNDS: Rect = { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };

export function clampPoint(b: Rect, p: Point): Point {
  return {
    x: Math.min(Math.max(p.x, b.x), b.x + b.width),
    y: Math.min(Math.max(p.y, b.y), b.y + b.height),
  };
}

export function clampPath(b: Rect, points: readonly Point[]): Point[] {
  return points.map((p) => clampPoint(b, p));
}

/** One axis: `[lo, hi]` of the bounds, `[min, max]` of the box, the proposed move. */
function axis(lo: number, hi: number, min: number, max: number, d: number): number {
  const l = Math.min(lo, min);
  const h = Math.max(hi, max);
  let r = d;
  if (min + r < l) r = l - min;
  if (max + r > h) r = h - max;
  return r;
}

/** The part of `delta` that keeps `rect` inside `b` (`clampTranslation(for:proposedDelta:)`). */
export function clampTranslation(b: Rect, rect: Rect, delta: Point): Point {
  return {
    x: axis(b.x, b.x + b.width, rect.x, rect.x + rect.width, delta.x),
    y: axis(b.y, b.y + b.height, rect.y, rect.y + rect.height, delta.y),
  };
}
