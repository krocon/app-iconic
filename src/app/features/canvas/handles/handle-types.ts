import { BoxHandle } from '../../../shared/geometry/box-math';
import { Point } from '../../../shared/geometry/view-transform';

/**
 * Handles of the canvas (design 007 E5/E6; legacy §6 `HandleTypes.swift`): kind = colour and
 * size of the template (colours as tokens `--ai-handle-*`, sizes here because they are geometry
 * too – the handle hit area), role = what dragging it changes.
 */
export type HandleKind = 'position' | 'size' | 'control' | 'anchor' | 'midpoint' | 'pivot';

/** Size in screen pixels (template: points), independent of the zoom. */
export const HANDLE_SIZE: Record<HandleKind, number> = {
  position: 8,
  size: 6,
  control: 5,
  anchor: 6,
  midpoint: 7,
  pivot: 9,
};

export type HandleRole =
  /** Moves the shape's reference point: rect top left, circle / ellipse centre, text position. */
  | { t: 'move' }
  | { t: 'rectCorner'; corner: 'tr' | 'bl' | 'br' }
  | { t: 'rectRadius' }
  | { t: 'radius'; axis: 'r' | 'rx' | 'ry' }
  | { t: 'lineEnd'; end: 1 | 2 }
  | { t: 'vertex'; index: number }
  /** Midpoint of a polyline / polygon segment: inserts a point. */
  | { t: 'segment'; index: number }
  | { t: 'pathAnchor'; index: number }
  | { t: 'pathControl'; seg: number; which: 'c1' | 'c2' }
  | { t: 'pathMid'; seg: number }
  /** The text-anchor marker (±20 like the template); a click cycles start → middle → end. */
  | { t: 'textAnchor' }
  | { t: 'box'; handle: BoxHandle }
  | { t: 'pivot'; item: number };

export interface Handle {
  /** Stable within one handle set (`role` as text) – the overlay's data-handle. */
  id: string;
  kind: HandleKind;
  role: HandleRole;
  /** In the space of its handle set (the node's user space, or the document). */
  local: Point;
  /** A control point's anchor: drawn as a thin line. */
  tie?: Point;
  /** Accessible name (template descriptions: "Top-left", "Radius" …). */
  label: string;
}

export function roleId(r: HandleRole): string {
  return Object.values(r).join(':');
}
