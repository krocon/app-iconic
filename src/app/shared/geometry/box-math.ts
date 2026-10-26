import { Rect } from './dom-geometry';
import { Matrix } from './matrix';
import { Point } from './view-transform';

/**
 * Box handles (design 007 E7; taken over from the template's `CanvasSelectionOverlay.swift`:
 * `computeScaleFactors`, `transformForScaling`, Marc's own code): eight handles around a box, the
 * opposite side stays put, corners scale uniformly (dominant factor), edges on their axis only.
 * Pure.
 */

export type BoxHandle =
  'topLeft' | 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left';

export const BOX_HANDLES: readonly BoxHandle[] = [
  'topLeft',
  'top',
  'topRight',
  'right',
  'bottomRight',
  'bottom',
  'bottomLeft',
  'left',
];

/** Position of a handle as fractions of the box (0 = left/top, 1 = right/bottom). */
const AT: Record<BoxHandle, [number, number]> = {
  topLeft: [0, 0],
  top: [0.5, 0],
  topRight: [1, 0],
  right: [1, 0.5],
  bottomRight: [1, 1],
  bottom: [0.5, 1],
  bottomLeft: [0, 1],
  left: [0, 0.5],
};

export function boxHandlePoint(r: Rect, h: BoxHandle): Point {
  const [fx, fy] = AT[h];
  return { x: r.x + r.width * fx, y: r.y + r.height * fy };
}

/** The point that stays put while `h` is dragged: the opposite handle. */
export function oppositeAnchor(r: Rect, h: BoxHandle): Point {
  const [fx, fy] = AT[h];
  return { x: r.x + r.width * (1 - fx), y: r.y + r.height * (1 - fy) };
}

export function isCorner(h: BoxHandle): boolean {
  return h === 'topLeft' || h === 'topRight' || h === 'bottomRight' || h === 'bottomLeft';
}

/** Scale factors that bring the handle from `initial` to `proposed` around `anchor`. */
export function computeScaleFactors(
  h: BoxHandle,
  initial: Point,
  anchor: Point,
  proposed: Point,
  allowFlip = false,
  minScale = 0.05,
): { scaleX: number; scaleY: number } {
  const iv = { x: initial.x - anchor.x, y: initial.y - anchor.y };
  const pv = { x: proposed.x - anchor.x, y: proposed.y - anchor.y };
  const clamped = (v: number) => {
    if (!allowFlip) return Math.max(v, minScale);
    if (Math.abs(v) >= minScale) return v;
    return v >= 0 ? minScale : -minScale;
  };
  const sx = iv.x !== 0 ? pv.x / iv.x : 1;
  const sy = iv.y !== 0 ? pv.y / iv.y : 1;
  if (isCorner(h)) {
    const dominant = Math.abs(sx) > Math.abs(sy) ? sx : sy;
    const u = clamped(dominant);
    const f = allowFlip ? u : Math.abs(u);
    return { scaleX: f, scaleY: f };
  }
  if (h === 'top' || h === 'bottom') return { scaleX: 1, scaleY: clamped(sy) };
  return { scaleX: clamped(sx), scaleY: 1 };
}

/** `T(anchor) · S(sx, sy) · T(−anchor)` (`transformForScaling`). */
export function scaleAbout(anchor: Point, sx: number, sy: number): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: anchor.x * (1 - sx), f: anchor.y * (1 - sy) };
}
