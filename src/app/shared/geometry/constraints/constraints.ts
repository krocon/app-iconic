import { Point } from '../view-transform';
import { Circle, entityOf, EntityKind, Line, SketchSystem } from './sketch-model';

/**
 * The relations of a sketch (prompt 059, like Fusion 360's sketch constraints) and the driving
 * dimensions, serialisable (stored in the asset, the AI's `constraint.add`). Each one is a set of
 * residuals in document units (lengths) or radians-like numbers (directions) that are zero when it
 * holds. Pure.
 */
export const RELATIONS = [
  'coincident',
  'horizontal',
  'vertical',
  'parallel',
  'perpendicular',
  'tangent',
  'equal',
  'concentric',
  'midpoint',
  'symmetric',
  'fix',
] as const;
export const DIMENSIONS = ['distance', 'length', 'radius', 'diameter', 'angle'] as const;
export type RelationType = (typeof RELATIONS)[number];
export type DimensionType = (typeof DIMENSIONS)[number];
export type ConstraintType = RelationType | DimensionType;
export const CONSTRAINT_TYPES: readonly ConstraintType[] = [...RELATIONS, ...DIMENSIONS];

export interface Constraint {
  id: string;
  type: ConstraintType;
  /** Entities `cid.part` (one asset). */
  refs: string[];
  /** Dimensions: the value (document units; angle: degrees, signed). */
  value?: number;
  /** `fix`: the point in document units. */
  point?: [number, number];
  /** `tangent` of two circles: inside the other. */
  internal?: boolean;
}

export const isDimension = (t: ConstraintType): t is DimensionType =>
  (DIMENSIONS as readonly string[]).includes(t);

/** The entity kinds a constraint takes, in order (alternatives per position). */
export function signatures(type: ConstraintType): EntityKind[][] {
  switch (type) {
    case 'coincident':
      return [
        ['point', 'point'],
        ['point', 'line'],
        ['point', 'circle'],
      ];
    case 'horizontal':
    case 'vertical':
      return [['line'], ['point', 'point']];
    case 'parallel':
    case 'perpendicular':
    case 'angle':
      return [['line', 'line']];
    case 'tangent':
      return [
        ['line', 'circle'],
        ['circle', 'line'],
        ['circle', 'circle'],
      ];
    case 'equal':
      return [
        ['line', 'line'],
        ['circle', 'circle'],
      ];
    case 'concentric':
      return [['circle', 'circle']];
    case 'midpoint':
      return [
        ['point', 'line'],
        ['line', 'point'],
      ];
    case 'symmetric':
      return [['point', 'point', 'line']];
    case 'fix':
      return [['point']];
    case 'distance':
      return [
        ['point', 'point'],
        ['point', 'line'],
      ];
    case 'length':
      return [['line']];
    case 'radius':
    case 'diameter':
      return [['circle']];
  }
}

/** The kinds `refs` must have, or `null` if no signature fits `kinds` (a prefix may fit). */
export function fits(type: ConstraintType, kinds: readonly EntityKind[], complete = true): boolean {
  return signatures(type).some(
    (s) =>
      (complete ? s.length === kinds.length : s.length >= kinds.length) &&
      kinds.every((k, i) => s[i] === k),
  );
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dotp = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const len = (a: Point) => Math.hypot(a.x, a.y);
const dir = (l: Line) => sub(l.b, l.a);
/** Signed distance of `p` from the line (left positive). */
const lineDist = (p: Point, l: Line) => cross(dir(l), sub(p, l.a)) / Math.max(len(dir(l)), 1e-12);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Angle from l1 to l2 (radians, signed). */
const angleOf = (l1: Line, l2: Line) => Math.atan2(cross(dir(l1), dir(l2)), dotp(dir(l1), dir(l2)));

type Ev = (x: readonly number[]) => unknown;
type Resolved = { kind: EntityKind; at: Ev }[];

/** The entities of `c`, or `null` if one is missing or the kinds do not fit. */
export function resolve(sys: SketchSystem, c: Constraint): Resolved | null {
  const es = c.refs.map((r) => entityOf(sys, r));
  if (es.some((e) => !e)) return null;
  const r = es as Resolved;
  return fits(
    c.type,
    r.map((e) => e.kind),
  )
    ? r
    : null;
}

/** The residuals of `c` as a function of the variables, or `null` if it does not apply. */
export function residualOf(
  sys: SketchSystem,
  c: Constraint,
): ((x: readonly number[]) => number[]) | null {
  const e = resolve(sys, c);
  if (!e) return null;
  const P = (i: number, x: readonly number[]) => e[i].at(x) as Point;
  const L = (i: number, x: readonly number[]) => e[i].at(x) as Line;
  const C = (i: number, x: readonly number[]) => e[i].at(x) as Circle;
  const k = e.map((x) => x.kind).join(',');
  const v = c.value ?? 0;
  switch (c.type) {
    case 'coincident':
      if (k === 'point,point') return (x) => [P(0, x).x - P(1, x).x, P(0, x).y - P(1, x).y];
      if (k === 'point,line') return (x) => [lineDist(P(0, x), L(1, x))];
      return (x) => [len(sub(P(0, x), C(1, x).c)) - C(1, x).r];
    case 'horizontal':
      return k === 'line' ? (x) => [L(0, x).b.y - L(0, x).a.y] : (x) => [P(1, x).y - P(0, x).y];
    case 'vertical':
      return k === 'line' ? (x) => [L(0, x).b.x - L(0, x).a.x] : (x) => [P(1, x).x - P(0, x).x];
    case 'parallel':
      return (x) => {
        const a = dir(L(0, x));
        const b = dir(L(1, x));
        return [cross(a, b) / Math.max(len(a) * len(b), 1e-12)];
      };
    case 'perpendicular':
      return (x) => {
        const a = dir(L(0, x));
        const b = dir(L(1, x));
        return [dotp(a, b) / Math.max(len(a) * len(b), 1e-12)];
      };
    case 'tangent':
      if (k === 'circle,circle') {
        return (x) => {
          const a = C(0, x);
          const b = C(1, x);
          const d = len(sub(a.c, b.c));
          return [c.internal ? d - Math.abs(a.r - b.r) : d - (a.r + b.r)];
        };
      }
      return (x) => {
        const li = k === 'line,circle' ? 0 : 1;
        const ci = 1 - li;
        const circle = C(ci, x);
        return [Math.abs(lineDist(circle.c, L(li, x))) - circle.r];
      };
    case 'equal':
      return k === 'line,line'
        ? (x) => [len(dir(L(0, x))) - len(dir(L(1, x)))]
        : (x) => [C(0, x).r - C(1, x).r];
    case 'concentric':
      return (x) => [C(0, x).c.x - C(1, x).c.x, C(0, x).c.y - C(1, x).c.y];
    case 'midpoint': {
      const pi = k === 'point,line' ? 0 : 1;
      return (x) => {
        const l = L(1 - pi, x);
        const p = P(pi, x);
        return [p.x - (l.a.x + l.b.x) / 2, p.y - (l.a.y + l.b.y) / 2];
      };
    }
    case 'symmetric':
      return (x) => {
        const p = P(0, x);
        const q = P(1, x);
        const l = L(2, x);
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const u = dir(l);
        return [lineDist(mid, l), dotp(sub(q, p), u) / Math.max(len(u), 1e-12)];
      };
    case 'fix': {
      const [fx, fy] = c.point ?? [NaN, NaN];
      return (x) => [P(0, x).x - fx, P(0, x).y - fy];
    }
    case 'distance':
      return k === 'point,point'
        ? (x) => [len(sub(P(0, x), P(1, x))) - v]
        : (x) => [Math.abs(lineDist(P(0, x), L(1, x))) - v];
    case 'length':
      return (x) => [len(dir(L(0, x))) - v];
    case 'radius':
      return (x) => [C(0, x).r - v];
    case 'diameter':
      return (x) => [2 * C(0, x).r - v];
    case 'angle':
      return (x) => [wrap(angleOf(L(0, x), L(1, x)) - (v * Math.PI) / 180)];
  }
}

/** The current value a dimension measures (its value when it is added). */
export function measure(sys: SketchSystem, c: Omit<Constraint, 'value'>): number | null {
  const probe = residualOf(sys, { ...c, value: 0 } as Constraint);
  if (!probe) return null;
  const r = probe(sys.x0)[0];
  if (c.type === 'angle') return Math.round(((r * 180) / Math.PI) * 1000) / 1000;
  return Math.round(r * 1000) / 1000;
}

/** All residuals of the constraints that apply (the others are skipped). */
export function systemResiduals(
  sys: SketchSystem,
  constraints: readonly Constraint[],
): { f: (x: readonly number[]) => number[]; used: Constraint[] } {
  const fs: ((x: readonly number[]) => number[])[] = [];
  const used: Constraint[] = [];
  for (const c of constraints) {
    const f = residualOf(sys, c);
    if (f) {
      fs.push(f);
      used.push(c);
    }
  }
  return { f: (x) => fs.flatMap((f) => f(x)), used };
}
