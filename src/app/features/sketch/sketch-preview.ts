import { apply, Matrix } from '../../shared/geometry/matrix';
import {
  arcEnds,
  polar,
  polygonCorners,
  rectCorners,
  SketchShape,
} from '../../shared/geometry/sketch/sketch-shapes';
import { Point } from '../../shared/geometry/view-transform';
import { SketchAnchor, SketchTarget } from './sketch-targets';

/**
 * Path data of the sketch preview in VIEWPORT pixels (design 019 E7). `toView` is the canvas
 * matrix document → viewport (zoom and pan: a similarity), so circles stay circles. Pure.
 */

const n = (v: number) => Math.round(v * 100) / 100;
const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`;
const scaleOf = (m: Matrix) => Math.hypot(m.a, m.b);

function circlePath(c: Point, r: number): string {
  return `M ${n(c.x - r)} ${n(c.y)} a ${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`;
}

/** The outline of a shape. */
export function shapePath(shape: SketchShape | null, m: Matrix): string | null {
  if (!shape) return null;
  const k = scaleOf(m);
  switch (shape.kind) {
    case 'line':
      return `M ${pt(apply(m, shape.a))} L ${pt(apply(m, shape.b))}`;
    case 'rect': {
      const c = rectCorners(shape).map((p) => apply(m, p));
      return `M ${pt(c[0])} L ${pt(c[1])} L ${pt(c[2])} L ${pt(c[3])} Z`;
    }
    case 'circle':
      return shape.r > 0 ? circlePath(apply(m, shape.c), shape.r * k) : null;
    case 'arc': {
      const { start, end } = arcEnds(shape);
      const r = n(shape.r * k);
      const large = Math.abs(shape.sweep) > Math.PI ? 1 : 0;
      const sweep = shape.sweep > 0 ? 1 : 0;
      return `M ${pt(apply(m, start))} A ${r} ${r} 0 ${large} ${sweep} ${pt(apply(m, end))}`;
    }
    case 'polygon': {
      const c = polygonCorners(shape).map((p) => pt(apply(m, p)));
      return `M ${c.join(' L ')} Z`;
    }
  }
}

/** Construction lines: radius of circles and arcs, the base edge of rectangles. */
export function constructionPath(
  shape: SketchShape | null,
  placed: readonly Point[],
  m: Matrix,
): string {
  const parts: string[] = [];
  if (shape?.kind === 'arc') {
    const { start, end } = arcEnds(shape);
    const c = apply(m, shape.c);
    parts.push(`M ${pt(apply(m, start))} L ${pt(c)} L ${pt(apply(m, end))}`);
  } else if (shape?.kind === 'polygon' && shape.guide) {
    // the construction circle and the radius to the pointer (a corner / the middle of an edge)
    const half = Math.PI / shape.sides;
    const inner = shape.guide === 'inner';
    const r = inner ? shape.r * Math.cos(half) : shape.r;
    const to = polar(shape.c, r, inner ? shape.angle - half : shape.angle);
    const c = apply(m, shape.c);
    parts.push(circlePath(c, r * scaleOf(m)), `M ${pt(c)} L ${pt(apply(m, to))}`);
  } else if (shape?.kind === 'circle' && placed.length === 1) {
    parts.push(`M ${pt(apply(m, placed[0]))} L ${pt(apply(m, shape.c))}`);
  }
  return parts.join(' ');
}

/** Small crosses on the placed points. */
export function crossesPath(points: readonly Point[], m: Matrix, size = 5): string {
  return points
    .map((p) => {
      const v = apply(m, p);
      return `M ${n(v.x - size)} ${n(v.y)} h ${2 * size} M ${n(v.x)} ${n(v.y - size)} v ${2 * size}`;
    })
    .join(' ');
}

/** The highlight of a picked or hovered target (an edge drawn long, a circle, a line end). */
export function targetPath(t: SketchTarget | SketchAnchor | null, m: Matrix): string | null {
  if (!t) return null;
  if ('anchor' in t) {
    const v = apply(m, t.anchor.p);
    const d = { x: t.anchor.t.x * 24, y: t.anchor.t.y * 24 };
    return `${circlePath(v, 6)} M ${pt(v)} l ${n(d.x)} ${n(d.y)}`;
  }
  if (t.draw.kind === 'circle') return circlePath(apply(m, t.draw.c), t.draw.r * scaleOf(m));
  return `M ${pt(apply(m, t.draw.a))} L ${pt(apply(m, t.draw.b))}`;
}
