import { Rect } from './dom-geometry';
import { Point } from './view-transform';

/**
 * Selection maths of the canvas (design 007 E4): the marquee rectangle, intersection with node
 * bounds in document space and how a click / marquee combines with the current selection
 * (⇧ = add, ⌘/Ctrl = toggle). Pure.
 */

export type SelectMode = 'replace' | 'add' | 'toggle';

/** The rectangle spanned by two points (any direction). */
export function marqueeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Rectangles overlap or touch (a line has width 0 and is still hit). */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

/** The new selection from the current one and the hits of a click or a marquee. */
export function combineSelection<T>(
  current: readonly T[],
  hits: readonly T[],
  mode: SelectMode,
  same: (a: T, b: T) => boolean,
): T[] {
  const has = (list: readonly T[], x: T) => list.some((y) => same(x, y));
  const unique = hits.filter((h, i) => hits.findIndex((o) => same(h, o)) === i);
  if (mode === 'replace') return unique;
  if (mode === 'add') return [...current, ...unique.filter((h) => !has(current, h))];
  return [...current.filter((c) => !has(unique, c)), ...unique.filter((h) => !has(current, h))];
}

/** The mode of a pointer event: ⇧ adds, ⌘ (macOS) / Ctrl toggles. */
export function selectModeOf(
  e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  mac: boolean,
): SelectMode {
  if (mac ? e.metaKey : e.ctrlKey) return 'toggle';
  return e.shiftKey ? 'add' : 'replace';
}
