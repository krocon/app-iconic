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

/**
 * The move of every rect in document units, to the edge / centre of `reference` (default: the
 * union of the rects; prompt 054 adds the canvas and a key object).
 */
export function alignDeltas(
  rects: readonly Rect[],
  mode: AlignMode,
  reference: Rect = unionRect(rects),
): Point[] {
  const u = reference;
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

export type DistributeAxis = 'horizontal' | 'vertical';
/** Centres evenly apart, or the gaps between neighbours equal (`gap` given: that gap). */
export type DistributeKind = 'centers' | 'gaps';

/**
 * Distribute (prompt 054): the first and the last rect along the axis stay (by position), the
 * others move so their centres are evenly apart or the gaps between neighbours are equal; with a
 * fixed `gap` everything after the first follows at that gap. Moves in document units, in the
 * order of `rects`.
 */
export function distributeDeltas(
  rects: readonly Rect[],
  axis: DistributeAxis,
  kind: DistributeKind,
  gap?: number,
): Point[] {
  const h = axis === 'horizontal';
  const pos = (r: Rect) => (h ? r.x : r.y);
  const size = (r: Rect) => (h ? r.width : r.height);
  const order = rects
    .map((r, i) => ({ r, i }))
    .sort((a, b) => pos(a.r) + size(a.r) / 2 - (pos(b.r) + size(b.r) / 2));
  const out: Point[] = rects.map(() => ({ x: 0, y: 0 }));
  const put = (i: number, d: number) => (out[i] = h ? { x: d, y: 0 } : { x: 0, y: d });
  const n = order.length;
  if (n < 2) return out;
  const first = order[0].r;
  const last = order[n - 1].r;
  if (gap !== undefined) {
    let at = pos(first) + size(first) + gap;
    for (let k = 1; k < n; k++) {
      const { r, i } = order[k];
      put(i, at - pos(r));
      at += size(r) + gap;
    }
    return out;
  }
  if (n < 3) return out;
  if (kind === 'centers') {
    const c0 = pos(first) + size(first) / 2;
    const c1 = pos(last) + size(last) / 2;
    for (let k = 1; k < n - 1; k++) {
      const { r, i } = order[k];
      put(i, c0 + ((c1 - c0) * k) / (n - 1) - (pos(r) + size(r) / 2));
    }
    return out;
  }
  const total = order.reduce((s, o) => s + size(o.r), 0);
  const space = (pos(last) + size(last) - pos(first) - total) / (n - 1);
  let at = pos(first) + size(first) + space;
  for (let k = 1; k < n - 1; k++) {
    const { r, i } = order[k];
    put(i, at - pos(r));
    at += size(r) + space;
  }
  return out;
}

/** A number for an attribute: at most 4 decimals, no `-0`. */
export function fmt(n: number): string {
  const r = Math.round(n * 1e4) / 1e4;
  return String(r === 0 ? 0 : r);
}
