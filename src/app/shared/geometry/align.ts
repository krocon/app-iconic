import { Rect } from './dom-geometry';
import { Point } from './view-transform';

/**
 * Align (design 006 E13, legacy §7.3): the reference is the union of the bounds of the selection
 * in document space; every node moves so that its edge / centre meets the one of the union. Pure.
 */
export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom';

export const ALIGN_MODES: readonly AlignMode[] = [
  'left',
  'centerH',
  'right',
  'top',
  'middle',
  'bottom',
];

export function unionRect(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** The move of every rect in document units. */
export function alignDeltas(rects: readonly Rect[], mode: AlignMode): Point[] {
  const u = unionRect(rects);
  return rects.map((r) => {
    switch (mode) {
      case 'left':
        return { x: u.x - r.x, y: 0 };
      case 'centerH':
        return { x: u.x + u.width / 2 - (r.x + r.width / 2), y: 0 };
      case 'right':
        return { x: u.x + u.width - (r.x + r.width), y: 0 };
      case 'top':
        return { x: 0, y: u.y - r.y };
      case 'middle':
        return { x: 0, y: u.y + u.height / 2 - (r.y + r.height / 2) };
      case 'bottom':
        return { x: 0, y: u.y + u.height - (r.y + r.height) };
    }
  });
}

/**
 * A document-space move `d` in the coordinate system of a node's parent (matrix `m` = parent →
 * document): `P⁻¹·T(d)·P` is the translation by `A⁻¹·d` (`A` = linear part of `P`). `null` if
 * the matrix cannot be inverted.
 */
export function localDelta(
  m: { a: number; b: number; c: number; d: number },
  d: Point,
): Point | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return { x: (m.d * d.x - m.c * d.y) / det, y: (-m.b * d.x + m.a * d.y) / det };
}

/** A number for an attribute: at most 4 decimals, no `-0`. */
export function fmt(n: number): string {
  const r = Math.round(n * 1e4) / 1e4;
  return String(r === 0 ? 0 : r);
}
