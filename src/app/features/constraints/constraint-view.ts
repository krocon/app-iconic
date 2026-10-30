import { Constraint, isDimension } from '../../shared/geometry/constraints/constraints';
import {
  angleDimension,
  DimensionShape,
  linearDimension,
  radialDimension,
} from '../../shared/geometry/dimension';
import { apply, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { dimensionPath } from '../dimension/dimension-markup';
import { anchorOf } from './constraint-targets';
import { EntityValue } from './constraint.service';

/**
 * What the constraint overlay draws (prompt 059), pure: a small badge per relation next to its
 * first entity and the driving dimensions with their values – all in viewport pixels.
 */
export const GLYPHS: Record<string, string> = {
  coincident: '●',
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  tangent: 'T',
  equal: '=',
  concentric: '◎',
  midpoint: 'M',
  symmetric: '⇔',
  fix: '⌖',
  distance: '↔',
  length: 'L',
  radius: 'R',
  diameter: '⌀',
  angle: '∠',
};

export interface Badge {
  asset: string;
  id: string;
  type: Constraint['type'];
  glyph: string;
  at: Point;
  /** Does not hold now (prompt 065). */
  broken: boolean;
}

export interface DrivingDimension {
  asset: string;
  id: string;
  type: Constraint['type'];
  d: string;
  label: Point;
  rotate: number;
  text: string;
  value: number;
  broken: boolean;
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/** The value as the label shows it. */
export function valueText(c: Constraint): string {
  const v = Math.abs(c.value ?? 0);
  switch (c.type) {
    case 'angle':
      return `${n(v)}°`;
    case 'radius':
      return `R ${n(v)}`;
    case 'diameter':
      return `⌀ ${n(v)}`;
    default:
      return n(v);
  }
}

/** Where two lines meet (`null` if parallel). */
function meet(a: { a: Point; b: Point }, b: { a: Point; b: Point }): Point | null {
  const d1 = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
  const d2 = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.a.x - a.a.x) * d2.y - (b.a.y - a.a.y) * d2.x) / den;
  return { x: a.a.x + t * d1.x, y: a.a.y + t * d1.y };
}

const far = (v: Point, l: { a: Point; b: Point }) =>
  Math.hypot(l.a.x - v.x, l.a.y - v.y) > Math.hypot(l.b.x - v.x, l.b.y - v.y) ? l.a : l.b;

/** The shape of a driving dimension in viewport pixels. */
function shapeOf(
  c: Constraint,
  at: (ref: string) => EntityValue | null,
  toView: Matrix,
): DimensionShape | null {
  const V = (p: Point) => apply(toView, p);
  const k = Math.hypot(toView.a, toView.b) || 1;
  const e = c.refs.map(at);
  const off = (a: Point, b: Point, px: number): Point => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { x: mid.x - ((b.y - a.y) / len) * px, y: mid.y + ((b.x - a.x) / len) * px };
  };
  switch (c.type) {
    case 'length': {
      const l = e[0]?.line;
      if (!l) return null;
      const a = V(l.a);
      const b = V(l.b);
      return linearDimension(a, b, off(a, b, 24), 6);
    }
    case 'distance': {
      const p = e[0]?.point;
      let q = e[1]?.point;
      const l = e[1]?.line;
      if (p && l) {
        const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y };
        const t = ((p.x - l.a.x) * d.x + (p.y - l.a.y) * d.y) / (d.x * d.x + d.y * d.y || 1);
        q = { x: l.a.x + t * d.x, y: l.a.y + t * d.y };
      }
      if (!p || !q) return null;
      const a = V(p);
      const b = V(q);
      return linearDimension(a, b, off(a, b, 24), 6);
    }
    case 'radius':
    case 'diameter': {
      const ci = e[0]?.circle;
      if (!ci) return null;
      const c0 = V(ci.c);
      const r = ci.r * k;
      const at = { x: c0.x + (r + 20) * Math.SQRT1_2, y: c0.y - (r + 20) * Math.SQRT1_2 };
      return radialDimension(c0, r, at, c.type === 'diameter');
    }
    case 'angle': {
      const l1 = e[0]?.line;
      const l2 = e[1]?.line;
      const v = l1 && l2 ? meet(l1, l2) : null;
      if (!l1 || !l2 || !v) return null;
      const vv = V(v);
      const p1 = V(far(v, l1));
      const p2 = V(far(v, l2));
      const u = (p: Point) => {
        const len = Math.hypot(p.x - vv.x, p.y - vv.y) || 1;
        return { x: (p.x - vv.x) / len, y: (p.y - vv.y) / len };
      };
      const b = { x: u(p1).x + u(p2).x, y: u(p1).y + u(p2).y };
      const bl = Math.hypot(b.x, b.y) || 1;
      return angleDimension(vv, p1, p2, { x: vv.x + (b.x / bl) * 40, y: vv.y + (b.y / bl) * 40 });
    }
    default:
      return null;
  }
}

export function overlayItems(
  asset: string,
  list: readonly Constraint[],
  at: (ref: string) => EntityValue | null,
  toView: Matrix,
  broken: ReadonlySet<string> = new Set(),
): { badges: Badge[]; dims: DrivingDimension[] } {
  const badges: Badge[] = [];
  const dims: DrivingDimension[] = [];
  const stack = new Map<string, number>();
  for (const c of list) {
    if (isDimension(c.type)) {
      const s = shapeOf(c, at, toView);
      if (s) {
        dims.push({
          asset,
          id: c.id,
          type: c.type,
          d: dimensionPath(s, 8),
          label: s.label,
          rotate: s.rotate,
          text: valueText(c),
          value: Math.abs(c.value ?? 0),
          broken: broken.has(c.id),
        });
        continue;
      }
    }
    const first = at(c.refs[0]);
    const a = first && anchorOf(first);
    if (!a) continue;
    const p = apply(toView, a);
    const key = `${Math.round(p.x / 4)}:${Math.round(p.y / 4)}`;
    const i = stack.get(key) ?? 0;
    stack.set(key, i + 1);
    badges.push({
      asset,
      id: c.id,
      type: c.type,
      glyph: GLYPHS[c.type] ?? '?',
      at: { x: p.x + 10 + i * 18, y: p.y - 14 },
      broken: broken.has(c.id),
    });
  }
  return { badges, dims };
}
