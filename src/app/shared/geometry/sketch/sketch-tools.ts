import { Point } from '../view-transform';
import {
  pickByPointer,
  pickNearestCenter,
  pickSmallest,
  sideOf,
  Tangent,
  tangentCircles,
} from './apollonius';
import { polygonAround, polygonOnEdge, sidesOf, validSides } from './polygon';
import {
  add,
  arcFromCenterTangent,
  arcThrough,
  circumcircle,
  dist,
  dot,
  docAngleFromDeg,
  MAX_SWEEP,
  mid,
  nearestTurn,
  normal,
  polar,
  rectFromEdge,
  scale,
  SketchShape,
  sub,
  tangentArc,
  unit,
} from './sketch-shapes';

/**
 * The steps of every sketch tool and what a pointer position plus the typed values make of them
 * (design 019 E5, E8, E9). Mouse, keyboard and the AI's `points` / `values` all go through the
 * same functions. Document units; field angles in degrees counter-clockwise. Pure.
 */

export type SketchToolId =
  | 'line'
  | 'midpointLine'
  | 'rect2p'
  | 'rect3p'
  | 'rectCenter'
  | 'circleCenter'
  | 'circle2p'
  | 'circle3p'
  | 'circle2t'
  | 'circle3t'
  | 'arc3p'
  | 'arcCenter'
  | 'arcTangent'
  | 'polygonCircumscribed'
  | 'polygonInscribed'
  | 'polygonEdge';

export type FieldKey =
  'length' | 'angle' | 'width' | 'height' | 'diameter' | 'radius' | 'start' | 'sweep' | 'sides';
export type Locks = Partial<Record<FieldKey, number>>;
export type Pick = 'point' | 'tangent' | 'anchor';

export interface StepDef {
  pick: Pick;
  fields: FieldKey[];
}

/** The end of an open line or arc a tangent arc continues from: `t` = unit direction of travel. */
export interface Anchor {
  p: Point;
  t: Point;
}

/** A placed step: its point (snapped / resolved) and, for picks, what was picked. */
export interface Placed {
  p: Point;
  tangent?: Tangent;
  anchor?: Anchor;
  /** The typed values in force when the step was placed. */
  locks?: Locks;
  /** Signed sweep (radians, document) of a centre point arc's last step. */
  sweep?: number;
}

const P = (...fields: FieldKey[]): StepDef => ({ pick: 'point', fields });
const T: StepDef = { pick: 'tangent', fields: [] };

export const SKETCH_TOOLS: Record<SketchToolId, { steps: StepDef[] }> = {
  line: { steps: [P(), P('length', 'angle')] },
  midpointLine: { steps: [P(), P('length', 'angle')] },
  rect2p: { steps: [P(), P('width', 'height')] },
  rect3p: { steps: [P(), P('length', 'angle'), P('height')] },
  rectCenter: { steps: [P(), P('width', 'height')] },
  circleCenter: { steps: [P(), P('diameter')] },
  circle2p: { steps: [P(), P('diameter', 'angle')] },
  circle3p: { steps: [P(), P(), P()] },
  circle2t: { steps: [T, T, P('diameter')] },
  circle3t: { steps: [T, T, T, P()] },
  arc3p: { steps: [P(), P(), P('radius')] },
  arcCenter: { steps: [P(), P('radius', 'start'), P('sweep')] },
  arcTangent: { steps: [{ pick: 'anchor', fields: [] }, P('radius', 'sweep')] },
  // like Fusion: the number of sides first (it has the focus after the first click)
  polygonCircumscribed: { steps: [P(), P('sides', 'diameter', 'angle')] },
  polygonInscribed: { steps: [P(), P('sides', 'diameter', 'angle')] },
  polygonEdge: { steps: [P(), P('sides', 'length', 'angle'), P()] },
};

/** The fields in degrees (any value); the others are sizes (> 0) or the number of sides. */
export const ANGLE_FIELDS: ReadonlySet<FieldKey> = new Set<FieldKey>(['angle', 'start', 'sweep']);

/** A typed value the field can take. */
export function fieldValueOk(f: FieldKey, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (ANGLE_FIELDS.has(f)) return true;
  return f === 'sides' ? validSides(v) : v > 0;
}

export const SKETCH_TOOL_IDS = Object.keys(SKETCH_TOOLS) as SketchToolId[];

const has = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
const RIGHT = { x: 1, y: 0 };

/** Direction from `a` towards `p`, or the typed angle. */
function direction(a: Point, p: Point, angle: number | undefined): Point {
  return has(angle)
    ? { x: Math.cos(docAngleFromDeg(angle)), y: Math.sin(docAngleFromDeg(angle)) }
    : (unit(sub(p, a)) ?? RIGHT);
}

/** `a + dir · length`, the length from the pointer unless typed. */
function along(a: Point, p: Point, length: number | undefined, angle: number | undefined): Point {
  const d = direction(a, p, angle);
  // a typed angle: the length is the pointer's distance along it (never backwards)
  const free = has(angle) ? Math.max(0, dot(sub(p, a), d)) : dist(a, p);
  return add(a, scale(d, has(length) ? length : free));
}

/** Width/height from the pointer, typed values keep the pointer's side. */
function box(a: Point, p: Point, w: number | undefined, h: number | undefined, k: number): Point {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return {
    x: has(w) ? a.x + (sx * w) / k : p.x,
    y: has(h) ? a.y + (sy * h) / k : p.y,
  };
}

/** Signed height of `p` across the edge `a → b` (positive = right side on screen). */
export function heightAcross(a: Point, b: Point, p: Point): number {
  const e = unit(sub(b, a)) ?? RIGHT;
  return dot({ x: -e.y, y: e.x }, sub(p, a));
}

/** The arc start → end with radius `r` whose middle is nearest to `p`; the middle point. */
function arcMiddleWithRadius(s: Point, e: Point, r: number, p: Point): Point | null {
  const half = dist(s, e) / 2;
  if (!(r >= half) || half === 0) return null;
  const m = mid(s, e);
  const n = unit(normal(sub(e, s)))!;
  const off = Math.sqrt(r * r - half * half);
  let best: Point | null = null;
  for (const k of [off, -off]) {
    const c = add(m, scale(n, k));
    for (const side of [1, -1]) {
      // the arc's middle: from the centre away from (or through) the chord
      const toMid = unit(sub(m, c)) ?? scale(n, -1);
      const q = add(c, scale(toMid, side * r));
      if (!best || dist(q, p) < dist(best, p)) best = q;
    }
  }
  return best;
}

/** The tangent targets placed so far. */
const tangentsOf = (placed: readonly Placed[]) =>
  placed.flatMap((s) => (s.tangent ? [s.tangent] : []));

/**
 * The point of the current step (index `placed.length`) from the pointer and the typed values;
 * `sweep` for the last step of a centre point arc (unwrapped towards `prevSweep`).
 */
export function resolveStep(
  tool: SketchToolId,
  placed: readonly Placed[],
  pointer: Point,
  locks: Locks = {},
  prevSweep = 0,
): Placed {
  const step = placed.length;
  const a = placed[0]?.p;
  const own = { locks: { ...locks } };
  if (!a || step === 0) return { p: pointer, ...own };
  switch (tool) {
    case 'line':
    case 'rect3p':
      if (step === 1) return { p: along(a, pointer, locks.length, locks.angle), ...own };
      break;
    case 'midpointLine':
      return {
        p: along(a, pointer, has(locks.length) ? locks.length / 2 : undefined, locks.angle),
        ...own,
      };
    case 'circle2p':
      return { p: along(a, pointer, locks.diameter, locks.angle), ...own };
    case 'circleCenter':
      return {
        p: along(a, pointer, has(locks.diameter) ? locks.diameter / 2 : undefined, undefined),
        ...own,
      };
    case 'polygonCircumscribed':
    case 'polygonInscribed':
      // the pointer: middle of an edge / a corner; the diameter of the construction circle
      return {
        p: along(a, pointer, has(locks.diameter) ? locks.diameter / 2 : undefined, locks.angle),
        ...own,
      };
    case 'polygonEdge':
      if (step === 1) return { p: along(a, pointer, locks.length, locks.angle), ...own };
      break;
    case 'rect2p':
      return { p: box(a, pointer, locks.width, locks.height, 1), ...own };
    case 'rectCenter':
      return { p: box(a, pointer, locks.width, locks.height, 2), ...own };
    case 'arc3p':
      if (step === 2 && has(locks.radius)) {
        const q = arcMiddleWithRadius(a, placed[1].p, locks.radius, pointer);
        if (q) return { p: q, ...own };
      }
      break;
    case 'arcCenter':
      if (step === 1) {
        const r = has(locks.radius) ? locks.radius : dist(a, pointer);
        return { p: add(a, scale(direction(a, pointer, locks.start), r)), ...own };
      }
      if (step === 2) {
        const r = dist(a, placed[1].p);
        const start = Math.atan2(placed[1].p.y - a.y, placed[1].p.x - a.x);
        const raw = Math.atan2(pointer.y - a.y, pointer.x - a.x) - start;
        let sweep = has(locks.sweep) ? (-locks.sweep * Math.PI) / 180 : nearestTurn(raw, prevSweep);
        sweep = Math.max(-MAX_SWEEP, Math.min(MAX_SWEEP, sweep));
        return { p: polar(a, r, start + sweep), sweep, ...own };
      }
      break;
    case 'arcTangent': {
      const arc = tangentArcFor(placed[0], pointer, locks);
      return { p: arc ? polar(arc.c, arc.r, arc.start + arc.sweep) : pointer, ...own };
    }
  }
  if (tool === 'rect3p' && step === 2) {
    const b = placed[1].p;
    const hp = heightAcross(a, b, pointer);
    const h = has(locks.height) ? (hp < 0 ? -locks.height : locks.height) : hp;
    const e = unit(sub(b, a)) ?? RIGHT;
    return { p: add(pointer, scale({ x: -e.y, y: e.x }, h - hp)), ...own };
  }
  return { p: pointer, ...own };
}

/** The tangent arc from an anchor towards `p` with typed radius / sweep. */
function tangentArcFor(start: Placed, p: Point, locks: Locks) {
  const anc = start.anchor;
  if (!anc) return null;
  let arc: { c: Point; r: number; start: number; sweep: number } | null;
  if (has(locks.radius) && locks.radius > 0) {
    const n = normal(anc.t);
    const side = dot(n, sub(p, anc.p)) < 0 ? -1 : 1;
    const c = add(anc.p, scale(n, side * locks.radius));
    arc = arcFromCenterTangent(c, anc.p, anc.t, p);
  } else {
    arc = tangentArc(anc.p, anc.t, p);
  }
  if (!arc) return null;
  if (has(locks.sweep)) {
    const s = (Math.min(Math.abs(locks.sweep), 359.9) * Math.PI) / 180;
    arc = { ...arc, sweep: arc.sweep < 0 ? -s : s };
  }
  return arc;
}

/** The circle of a tangent tool (design 019 E9) for the steps placed and the pointer. */
function tangentCircle(tool: SketchToolId, placed: readonly Placed[], cur: Placed | null) {
  const targets = tangentsOf(placed);
  if (!cur) return null;
  if (tool === 'circle3t') {
    if (targets.length < 3) return null;
    return pickByPointer(tangentCircles(targets), cur.p);
  }
  if (targets.length < 2) return null;
  const d = cur.locks?.diameter;
  if (has(d) && d > 0) return pickNearestCenter(tangentCircles(targets, { radius: d / 2 }), cur.p);
  const sides = targets.map((t) => sideOf(t, cur.p));
  return pickSmallest(tangentCircles(targets, { point: cur.p, sides }));
}

/**
 * The shape of `placed` plus the current step `cur` (the preview while drawing; the result when
 * every step is placed and `cur` is `null`). `null` = nothing to show yet / no solution.
 */
export function shapeOf(
  tool: SketchToolId,
  placed: readonly Placed[],
  cur: Placed | null,
): SketchShape | null {
  const steps = [...placed, ...(cur ? [cur] : [])];
  const a = steps[0]?.p;
  const b = steps[1]?.p;
  const c = steps[2]?.p;
  switch (tool) {
    case 'line':
      return a && b ? { kind: 'line', a, b } : null;
    case 'midpointLine':
      return a && b ? { kind: 'line', a: sub(scale(a, 2), b), b } : null;
    case 'rect2p':
    case 'rectCenter': {
      if (!a || !b) return null;
      const lo = tool === 'rect2p' ? a : sub(scale(a, 2), b);
      return {
        kind: 'rect',
        c: mid(lo, b),
        w: Math.abs(b.x - lo.x),
        h: Math.abs(b.y - lo.y),
        angle: 0,
      };
    }
    case 'rect3p':
      if (!a || !b) return null;
      return { kind: 'rect', ...rectFromEdge(a, b, c ? heightAcross(a, b, c) : 0) };
    case 'circleCenter':
      return a && b ? { kind: 'circle', c: a, r: dist(a, b) } : null;
    case 'circle2p':
      return a && b ? { kind: 'circle', c: mid(a, b), r: dist(a, b) / 2 } : null;
    case 'circle3p': {
      if (!a || !b) return null;
      if (!c) return { kind: 'circle', c: mid(a, b), r: dist(a, b) / 2 };
      const circle = circumcircle(a, b, c);
      return circle ? { kind: 'circle', ...circle } : null;
    }
    case 'circle2t':
    case 'circle3t': {
      const n = tool === 'circle2t' ? 2 : 3;
      const last = steps[n];
      const circle = last ? tangentCircle(tool, steps.slice(0, n), last) : null;
      return circle ? { kind: 'circle', ...circle } : null;
    }
    case 'arc3p': {
      if (!a || !b) return null;
      if (!c) return { kind: 'line', a, b };
      const arc = arcThrough(a, c, b);
      return arc ? { kind: 'arc', ...arc } : null;
    }
    case 'arcCenter': {
      if (!a || !b) return null;
      const r = dist(a, b);
      const start = Math.atan2(b.y - a.y, b.x - a.x);
      if (!c) return { kind: 'circle', c: a, r };
      return { kind: 'arc', c: a, r, start, sweep: steps[2].sweep ?? 0 };
    }
    case 'arcTangent': {
      if (!b || !steps[0].anchor) return null;
      const arc = tangentArcFor(steps[0], b, steps[1].locks ?? {});
      return arc ? { kind: 'arc', ...arc } : { kind: 'line', a: steps[0].anchor.p, b };
    }
    case 'polygonCircumscribed':
    case 'polygonInscribed': {
      if (!a || !b) return null;
      const mode = tool === 'polygonInscribed' ? 'inscribed' : 'circumscribed';
      return polygonAround(a, b, sidesOf(steps[1].locks?.sides), mode);
    }
    case 'polygonEdge':
      return a && b ? polygonOnEdge(a, b, sidesOf(steps[1].locks?.sides), c) : null;
  }
}
