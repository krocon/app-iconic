import { Point } from '../view-transform';
import { polygonAround } from './polygon';
import { polarGrid, quarterArc, rectGrid, spiral, star, straightRatio } from './more-shapes';
import { SketchShape } from './sketch-shapes';

/**
 * Shapes drawn with one drag like the shape tools of Marc's VectorCraft
 * (`crates/tools/src/shape.rs`): press = start, release = the other end. Shift: a square, a
 * circle, 45° steps, an upright polygon; Alt: from the centre. Document units. Pure.
 */

export type DragToolId =
  | 'dragRect'
  | 'dragEllipse'
  | 'dragPolygon'
  | 'dragLine'
  | 'dragRoundRect'
  | 'dragStar'
  | 'dragSpiral'
  | 'dragRectGrid'
  | 'dragPolarGrid'
  | 'dragArc';

export const DRAG_TOOL_IDS: readonly DragToolId[] = [
  'dragRect',
  'dragEllipse',
  'dragPolygon',
  'dragLine',
  'dragRoundRect',
  'dragStar',
  'dragSpiral',
  'dragRectGrid',
  'dragPolarGrid',
  'dragArc',
];

/**
 * What ↑/↓ change while dragging (prompt 044): start value, range and step – the sides of a
 * polygon, a star's points, a spiral's quarter turns, a grid's dividers, the corner radius.
 */
export const DRAG_COUNTS: Partial<
  Record<DragToolId, { start: number; min: number; max: number; step: number }>
> = {
  dragPolygon: { start: 6, min: 3, max: 64, step: 1 },
  dragStar: { start: 5, min: 3, max: 64, step: 1 },
  dragSpiral: { start: 10, min: 1, max: 64, step: 1 },
  dragRectGrid: { start: 5, min: 0, max: 64, step: 1 },
  dragPolarGrid: { start: 5, min: 0, max: 64, step: 1 },
  dragRoundRect: { start: 12, min: 0, max: 512, step: 2 },
};

/** `v` as a count of `tool` (its start when missing, clamped, whole steps). */
export function countOf(tool: DragToolId, v: number | undefined): number {
  const c = DRAG_COUNTS[tool];
  if (!c) return 0;
  const x = v !== undefined && Number.isFinite(v) ? v : c.start;
  return Math.max(c.min, Math.min(c.max, Math.round(x)));
}

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
  count?: number,
): SketchShape | null {
  const n = countOf(tool, count);
  const sides = tool === 'dragPolygon' ? n : 6;
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
    case 'dragRoundRect': {
      const r = box(a, b, m);
      return { kind: 'rect', c: r.c, w: r.w, h: r.h, angle: 0, r: Math.min(n, r.w / 2, r.h / 2) };
    }
    case 'dragStar': {
      // from the centre: the pointer is a tip; Shift keeps a tip up, Alt straight shoulders
      const r1 = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = (m.alt ? straightRatio(n) : null) ?? 0.5;
      const angle = m.shift ? -Math.PI / 2 : Math.atan2(b.y - a.y, b.x - a.x);
      return { kind: 'paths', subpaths: [star(a, r1, r1 * ratio, n, angle)] };
    }
    case 'dragSpiral': {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      return {
        kind: 'paths',
        subpaths: [spiral(a, r, n, Math.atan2(b.y - a.y, b.x - a.x), !m.alt)],
      };
    }
    case 'dragRectGrid':
    case 'dragPolarGrid': {
      const r = box(a, b, m);
      const [x0, y0, x1, y1] = [r.c.x - r.w / 2, r.c.y - r.h / 2, r.c.x + r.w / 2, r.c.y + r.h / 2];
      return {
        kind: 'paths',
        subpaths:
          tool === 'dragRectGrid'
            ? rectGrid(x0, y0, x1, y1, n, n)
            : polarGrid(x0, y0, x1, y1, n, n),
      };
    }
    case 'dragArc': {
      const raw = { x: b.x - a.x, y: b.y - a.y };
      const d = m.shift ? square(raw) : raw;
      return {
        kind: 'paths',
        subpaths: [quarterArc(a, { x: a.x + d.x, y: a.y + d.y }, m.alt ? -50 : 50)],
      };
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
  count?: number,
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
    case 'dragRoundRect':
    case 'dragRectGrid':
    case 'dragPolarGrid':
    case 'dragArc':
      if (!ok(v.width) || !ok(v.height)) return null;
      return dragShape(tool, p, { x: p.x + v.width, y: p.y + v.height }, {}, count);
    case 'dragStar':
    case 'dragSpiral':
      if (!ok(v.radius)) return null;
      return dragShape(
        tool,
        p,
        { x: p.x, y: p.y - v.radius },
        { shift: true },
        tool === 'dragStar' ? (v.sides ?? count) : count,
      );
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
