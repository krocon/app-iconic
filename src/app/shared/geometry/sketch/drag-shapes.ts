import { Point } from '../view-transform';
import { polygonAround } from './polygon';
import { SketchShape } from './sketch-shapes';

/**
 * Shapes drawn with one drag like the shape tools of Marc's VectorCraft
 * (`crates/tools/src/shape.rs`): press = start, release = the other end. Shift: a square, a
 * circle, 45° steps, an upright polygon; Alt: from the centre. Document units. Pure.
 */

export type DragToolId = 'dragRect' | 'dragEllipse' | 'dragPolygon' | 'dragLine';

export const DRAG_TOOL_IDS: readonly DragToolId[] = [
  'dragRect',
  'dragEllipse',
  'dragPolygon',
  'dragLine',
];

export function isDragTool(tool: string): tool is DragToolId {
  return (DRAG_TOOL_IDS as readonly string[]).includes(tool);
}

/** The keys held while dragging. */
export interface DragMods {
  shift?: boolean;
  alt?: boolean;
}

/** `d` with both sides as long as the longer one, the signs kept (Shift: square). */
export function square(d: Point): Point {
  const s = Math.max(Math.abs(d.x), Math.abs(d.y));
  return { x: d.x < 0 ? -s : s, y: d.y < 0 ? -s : s };
}

/** `d` turned to the nearest 45° step, its length kept. */
export function step45(d: Point): Point {
  const len = Math.hypot(d.x, d.y);
  const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);
  const r = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return { x: r(len * Math.cos(a)), y: r(len * Math.sin(a)) };
}

/** The box of a drag from `a` to `b`: from the corner, or (Alt) from the centre. */
function box(a: Point, b: Point, m: DragMods) {
  const raw = { x: b.x - a.x, y: b.y - a.y };
  const d = m.shift ? square(raw) : raw;
  const c = m.alt ? a : { x: a.x + d.x / 2, y: a.y + d.y / 2 };
  const k = m.alt ? 2 : 1;
  return { c, w: Math.abs(d.x) * k, h: Math.abs(d.y) * k };
}

/** The shape of a drag from `a` to `b` with the keys `m` (`sides` of a polygon). */
export function dragShape(
  tool: DragToolId,
  a: Point,
  b: Point,
  m: DragMods = {},
  sides = 6,
): SketchShape | null {
  switch (tool) {
    case 'dragRect': {
      const r = box(a, b, m);
      return { kind: 'rect', c: r.c, w: r.w, h: r.h, angle: 0 };
    }
    case 'dragEllipse': {
      const r = box(a, b, m);
      return { kind: 'ellipse', c: r.c, rx: r.w / 2, ry: r.h / 2 };
    }
    case 'dragPolygon': {
      // from the centre: the pointer is a corner; Shift keeps a corner straight up
      const s = polygonAround(a, b, sides, 'inscribed');
      if (!s || s.kind !== 'polygon') return s;
      return m.shift ? { ...s, angle: -Math.PI / 2 } : s;
    }
    case 'dragLine': {
      const raw = { x: b.x - a.x, y: b.y - a.y };
      const d = m.shift ? step45(raw) : raw;
      const start = m.alt ? { x: a.x - d.x, y: a.y - d.y } : a;
      return { kind: 'line', a: start, b: { x: a.x + d.x, y: a.y + d.y } };
    }
  }
}

/** The shape a size dialog gives at the click `p` (rectangle/ellipse: top left; polygon: centre). */
export function sizedShape(
  tool: DragToolId,
  p: Point,
  v: {
    width?: number;
    height?: number;
    radius?: number;
    sides?: number;
    length?: number;
    angle?: number;
  },
): SketchShape | null {
  const ok = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x) && x > 0;
  switch (tool) {
    case 'dragRect':
    case 'dragEllipse': {
      if (!ok(v.width) || !ok(v.height)) return null;
      const c = { x: p.x + v.width / 2, y: p.y + v.height / 2 };
      return tool === 'dragRect'
        ? { kind: 'rect', c, w: v.width, h: v.height, angle: 0 }
        : { kind: 'ellipse', c, rx: v.width / 2, ry: v.height / 2 };
    }
    case 'dragPolygon':
      if (!ok(v.radius) || !ok(v.sides)) return null;
      return { kind: 'polygon', c: p, r: v.radius, sides: v.sides, angle: -Math.PI / 2 };
    case 'dragLine': {
      if (!ok(v.length)) return null;
      const a = (-(v.angle ?? 0) * Math.PI) / 180;
      return {
        kind: 'line',
        a: p,
        b: { x: p.x + v.length * Math.cos(a), y: p.y + v.length * Math.sin(a) },
      };
    }
  }
}
