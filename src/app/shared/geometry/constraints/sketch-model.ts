import { apply, Matrix } from '../matrix';
import { Point } from '../view-transform';

/**
 * The geometry the constraint solver works on (prompt 059), pure: lines, rectangles, circles and
 * polygons / polylines, each with its numbers (the variables, in the element's own user space)
 * and the matrix to document units (measured by the browser once per solve, design 004 E11).
 * Every constraint is evaluated in document units, so elements in differently transformed groups
 * can be related.
 */
export type SketchKind = 'line' | 'rect' | 'circle' | 'poly';

export interface SketchElement {
  cid: string;
  kind: SketchKind;
  /**
   * line: x1 y1 x2 y2 · rect: its corners x1 y1 x2 y2 (dragging one corner resizes, it does not
   * move the box) · circle: cx cy r · poly: x0 y0 x1 y1 …
   */
  params: number[];
  /** User space → document units. */
  m: Matrix;
  /** Polygon (closed) or polyline. */
  closed?: boolean;
}

export type EntityKind = 'point' | 'line' | 'circle';

export interface Line {
  a: Point;
  b: Point;
}
export interface Circle {
  c: Point;
  r: number;
}

/** One entity of an element, evaluated from the variables. */
export type Entity =
  | { kind: 'point'; at: (x: readonly number[]) => Point }
  | { kind: 'line'; at: (x: readonly number[]) => Line }
  | { kind: 'circle'; at: (x: readonly number[]) => Circle };

/** The variables of all elements and where each element's start. */
export interface SketchSystem {
  elements: SketchElement[];
  offsets: Map<string, number>;
  x0: number[];
}

export function systemOf(elements: readonly SketchElement[]): SketchSystem {
  const offsets = new Map<string, number>();
  const x0: number[] = [];
  for (const e of elements) {
    if (offsets.has(e.cid)) continue;
    offsets.set(e.cid, x0.length);
    x0.push(...e.params);
  }
  return { elements: elements.filter((e, i) => elements.indexOf(e) === i), offsets, x0 };
}

/** The parts an element offers (for picking and for the AI). */
export function partsOf(e: SketchElement): { part: string; kind: EntityKind }[] {
  switch (e.kind) {
    case 'line':
      return [
        { part: 'p1', kind: 'point' },
        { part: 'p2', kind: 'point' },
        { part: 'line', kind: 'line' },
      ];
    case 'rect':
      return [
        ...['tl', 'tr', 'br', 'bl', 'center'].map((part) => ({ part, kind: 'point' as const })),
        ...['top', 'right', 'bottom', 'left'].map((part) => ({ part, kind: 'line' as const })),
      ];
    case 'circle':
      return [
        { part: 'center', kind: 'point' },
        { part: 'circle', kind: 'circle' },
      ];
    case 'poly': {
      const n = e.params.length / 2;
      const edges = e.closed ? n : n - 1;
      return [
        ...Array.from({ length: n }, (_, i) => ({ part: `p${i}`, kind: 'point' as const })),
        ...Array.from({ length: edges }, (_, i) => ({ part: `e${i}`, kind: 'line' as const })),
      ];
    }
  }
}

const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

/** The entity `ref` (`cid.part`) of the system, or `null`. */
export function entityOf(sys: SketchSystem, ref: string): Entity | null {
  const dot = ref.lastIndexOf('.');
  if (dot < 1) return null;
  const cid = ref.slice(0, dot);
  const part = ref.slice(dot + 1);
  const e = sys.elements.find((x) => x.cid === cid);
  const o = sys.offsets.get(cid);
  if (!e || o === undefined) return null;
  const P = (fx: (x: readonly number[]) => Point) => (x: readonly number[]) => apply(e.m, fx(x));
  const pt = (i: number, j: number) => P((x) => ({ x: x[o + i], y: x[o + j] }));
  const line = (a: (x: readonly number[]) => Point, b: (x: readonly number[]) => Point) => ({
    kind: 'line' as const,
    at: (x: readonly number[]) => ({ a: a(x), b: b(x) }),
  });
  const point = (at: (x: readonly number[]) => Point) => ({ kind: 'point' as const, at });
  switch (e.kind) {
    case 'line': {
      const p1 = pt(0, 1);
      const p2 = pt(2, 3);
      if (part === 'p1') return point(p1);
      if (part === 'p2') return point(p2);
      return part === 'line' ? line(p1, p2) : null;
    }
    case 'rect': {
      const c = (fx: number, fy: number) =>
        P((x) => ({ x: x[o] + fx * (x[o + 2] - x[o]), y: x[o + 1] + fy * (x[o + 3] - x[o + 1]) }));
      const corners: Record<string, (x: readonly number[]) => Point> = {
        tl: c(0, 0),
        tr: c(1, 0),
        br: c(1, 1),
        bl: c(0, 1),
        center: c(0.5, 0.5),
      };
      if (corners[part]) return point(corners[part]);
      const edges: Record<string, [string, string]> = {
        top: ['tl', 'tr'],
        right: ['tr', 'br'],
        bottom: ['bl', 'br'],
        left: ['tl', 'bl'],
      };
      const ed = edges[part];
      return ed ? line(corners[ed[0]], corners[ed[1]]) : null;
    }
    case 'circle': {
      const center = pt(0, 1);
      if (part === 'center') return point(center);
      const k = scaleOf(e.m);
      return part === 'circle'
        ? { kind: 'circle', at: (x) => ({ c: center(x), r: Math.abs(x[o + 2]) * k }) }
        : null;
    }
    case 'poly': {
      const n = e.params.length / 2;
      const m = /^([pe])(\d+)$/.exec(part);
      if (!m) return null;
      const i = Number(m[2]);
      if (m[1] === 'p') return i < n ? point(pt(2 * i, 2 * i + 1)) : null;
      const j = (i + 1) % n;
      if (i >= n || (!e.closed && i === n - 1)) return null;
      return line(pt(2 * i, 2 * i + 1), pt(2 * j, 2 * j + 1));
    }
  }
}

const num = (v: string | null) => {
  // plain numbers only: `50%` or `2em` are not something the solver may rewrite
  const n = v === null || v.trim() === '' ? NaN : Number(v.trim());
  return Number.isFinite(n) ? n : null;
};

/** The numbers of an element from its attributes, `null` if it cannot be constrained. */
export function paramsOf(
  tag: string,
  attr: (name: string) => string | null,
): { kind: SketchKind; params: number[]; closed?: boolean } | null {
  const all = (names: string[], fallback = 0) => {
    const v = names.map((n) => num(attr(n)) ?? (attr(n) === null ? fallback : null));
    return v.every((x): x is number => x !== null) ? v : null;
  };
  switch (tag) {
    case 'line': {
      const p = all(['x1', 'y1', 'x2', 'y2']);
      return p && { kind: 'line', params: p };
    }
    case 'rect': {
      const p = all(['x', 'y', 'width', 'height']);
      return p && p[2] >= 0 && p[3] >= 0
        ? { kind: 'rect', params: [p[0], p[1], p[0] + p[2], p[1] + p[3]] }
        : null;
    }
    case 'circle': {
      const p = all(['cx', 'cy', 'r']);
      return p && { kind: 'circle', params: p };
    }
    case 'polygon':
    case 'polyline': {
      const nums = (attr('points') ?? '')
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (nums.length < 4 || nums.length % 2 || !nums.every(Number.isFinite)) return null;
      return { kind: 'poly', params: nums, closed: tag === 'polygon' };
    }
  }
  return null;
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

/** The attributes for new numbers (rounded to 1/1000). */
export function attributesOf(kind: SketchKind, p: readonly number[]): Record<string, string> {
  switch (kind) {
    case 'line':
      return { x1: fmt(p[0]), y1: fmt(p[1]), x2: fmt(p[2]), y2: fmt(p[3]) };
    case 'rect':
      // corners crossed over flip the box instead of a negative `width`
      return {
        x: fmt(Math.min(p[0], p[2])),
        y: fmt(Math.min(p[1], p[3])),
        width: fmt(Math.abs(p[2] - p[0])),
        height: fmt(Math.abs(p[3] - p[1])),
      };
    case 'circle':
      return { cx: fmt(p[0]), cy: fmt(p[1]), r: fmt(Math.abs(p[2])) };
    case 'poly': {
      const pts: string[] = [];
      for (let i = 0; i < p.length; i += 2) pts.push(`${fmt(p[i])},${fmt(p[i + 1])}`);
      return { points: pts.join(' ') };
    }
  }
}
