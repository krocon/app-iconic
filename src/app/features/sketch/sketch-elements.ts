import { StyleKind } from '../../core/settings/settings.models';
import { fmt } from '../../shared/geometry/align';
import { apply, Matrix } from '../../shared/geometry/matrix';
import { arcEnds, SketchShape } from '../../shared/geometry/sketch/sketch-shapes';
import { UndoLabel } from '../document/undo/undo-texts';
import { ElementSpec } from '../commands/element-defaults';

/**
 * A sketch shape (document units) as an SVG element in the user space of its parent (design 019
 * E11). `toLocal` maps document → parent; when it is a similarity without mirroring the numbers
 * are converted, else the shape keeps document numbers and gets the matrix as `transform`. Pure.
 */

const EPS = 1e-9;

/** Scale and rotation of a similarity without mirroring; `null` for anything else. */
export function similarity(m: Matrix): { k: number; theta: number } | null {
  const k1 = Math.hypot(m.a, m.b);
  const k2 = Math.hypot(m.c, m.d);
  const det = m.a * m.d - m.b * m.c;
  if (!(k1 > EPS) || det <= 0) return null;
  if (Math.abs(k1 - k2) > 1e-9 * k1 || Math.abs(m.a * m.c + m.b * m.d) > 1e-9 * k1 * k1) {
    return null;
  }
  return { k: k1, theta: Math.atan2(m.b, m.a) };
}

const matrixText = (m: Matrix) =>
  `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => fmt(Number(v.toPrecision(12)))).join(' ')})`;

/** Degrees of a rotation, `0` for (almost) none. */
function degrees(rad: number): number {
  let d = (rad * 180) / Math.PI;
  d = (((d % 360) + 540) % 360) - 180;
  return Math.abs(d) < 1e-7 ? 0 : d;
}

/** The kind (style memory) and undo label of a shape. */
export function kindOf(shape: SketchShape): { kind: StyleKind; label: UndoLabel } {
  switch (shape.kind) {
    case 'line':
      return { kind: 'line', label: 'addLine' };
    case 'rect':
      return { kind: 'rect', label: 'addRect' };
    case 'circle':
      return { kind: 'circle', label: 'addCircle' };
    case 'arc':
      return { kind: 'arc', label: 'addArc' };
  }
}

/** Element of `shape` in a space where `map` places document points and `k`/`theta` scale/rotate. */
function build(
  shape: SketchShape,
  map: (p: { x: number; y: number }) => { x: number; y: number },
  k: number,
  theta: number,
): ElementSpec {
  switch (shape.kind) {
    case 'line': {
      const a = map(shape.a);
      const b = map(shape.b);
      return { tag: 'line', attrs: { x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y) } };
    }
    case 'circle': {
      const c = map(shape.c);
      return { tag: 'circle', attrs: { cx: fmt(c.x), cy: fmt(c.y), r: fmt(shape.r * k) } };
    }
    case 'rect': {
      const c = map(shape.c);
      const w = shape.w * k;
      const h = shape.h * k;
      const attrs: Record<string, string> = {
        x: fmt(c.x - w / 2),
        y: fmt(c.y - h / 2),
        width: fmt(w),
        height: fmt(h),
      };
      const deg = degrees(shape.angle + theta);
      if (deg !== 0) attrs['transform'] = `rotate(${fmt(deg)} ${fmt(c.x)} ${fmt(c.y)})`;
      return { tag: 'rect', attrs };
    }
    case 'arc': {
      const { start, end } = arcEnds(shape);
      const s = map(start);
      const e = map(end);
      const r = fmt(shape.r * k);
      const large = Math.abs(shape.sweep) > Math.PI ? 1 : 0;
      const sweep = shape.sweep > 0 ? 1 : 0;
      return {
        tag: 'path',
        attrs: {
          d: `M ${fmt(s.x)} ${fmt(s.y)} A ${r} ${r} 0 ${large} ${sweep} ${fmt(e.x)} ${fmt(e.y)}`,
        },
      };
    }
  }
}

/** The element of `shape` (document units) for a parent reached by `toLocal`, with `paint`. */
export function shapeSpec(
  shape: SketchShape,
  toLocal: Matrix | null,
  paint: Readonly<Record<string, string>>,
): ElementSpec {
  const sim = toLocal ? similarity(toLocal) : { k: 1, theta: 0 };
  const spec =
    toLocal && sim
      ? build(shape, (p) => apply(toLocal, p), sim.k, sim.theta)
      : build(shape, (p) => p, 1, 0);
  if (toLocal && !sim) {
    const own = spec.attrs['transform'];
    spec.attrs['transform'] = own ? `${matrixText(toLocal)} ${own}` : matrixText(toLocal);
  }
  return { tag: spec.tag, attrs: { ...spec.attrs, ...paint } };
}
