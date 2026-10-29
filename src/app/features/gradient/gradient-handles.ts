import { apply, invert, Matrix, multiply } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { GradientInfo } from './gradient-model';

/**
 * The handles of a gradient on the canvas (prompt 032), pure: linear start / end, radial centre,
 * radius and focus. `space` maps the gradient's coordinates to document units: the element's
 * matrix · `gradientTransform` · (bounding box units: the box as a unit square).
 */
export type HandleId = 'start' | 'end' | 'center' | 'radius' | 'focus';

export interface GradientHandle {
  id: HandleId;
  /** Document units. */
  at: Point;
}

/** The matrix from gradient coordinates to the element's user space (without its own CTM). */
export function gradientSpace(
  units: string,
  transform: Matrix,
  bbox: { x: number; y: number; width: number; height: number },
): Matrix {
  const box: Matrix =
    units === 'userSpaceOnUse'
      ? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      : { a: bbox.width, b: 0, c: 0, d: bbox.height, e: bbox.x, f: bbox.y };
  return multiply(box, transform);
}

export function handlesOf(info: GradientInfo, space: Matrix): GradientHandle[] {
  const c = info.coords;
  const at = (x: number, y: number) => apply(space, { x, y });
  if (info.kind === 'linear') {
    return [
      { id: 'start', at: at(c['x1'], c['y1']) },
      { id: 'end', at: at(c['x2'], c['y2']) },
    ];
  }
  return [
    { id: 'center', at: at(c['cx'], c['cy']) },
    { id: 'radius', at: at(c['cx'] + c['r'], c['cy']) },
    { id: 'focus', at: at(c['fx'], c['fy']) },
  ];
}

const round = (v: number, units: string) => {
  const k = units === 'userSpaceOnUse' ? 100 : 10000;
  return String(Math.round(v * k) / k);
};

/**
 * The attributes after dragging handle `id` to `p` (document units). Moving the centre takes the
 * focus along when they were together; the radius is the distance in gradient coordinates.
 */
export function dragHandle(
  info: GradientInfo,
  space: Matrix,
  id: HandleId,
  p: Point,
): Record<string, string | null> | null {
  const inv = invert(space);
  if (!inv) return null;
  const q = apply(inv, p);
  const u = info.units;
  const c = info.coords;
  switch (id) {
    case 'start':
      return { x1: round(q.x, u), y1: round(q.y, u) };
    case 'end':
      return { x2: round(q.x, u), y2: round(q.y, u) };
    case 'radius':
      return { r: round(Math.hypot(q.x - c['cx'], q.y - c['cy']), u) };
    case 'focus':
      return { fx: round(q.x, u), fy: round(q.y, u) };
    case 'center': {
      const out: Record<string, string | null> = { cx: round(q.x, u), cy: round(q.y, u) };
      const together = Math.hypot(c['fx'] - c['cx'], c['fy'] - c['cy']) < 1e-9;
      if (together) Object.assign(out, { fx: null, fy: null });
      else {
        out['fx'] = round(c['fx'] + q.x - c['cx'], u);
        out['fy'] = round(c['fy'] + q.y - c['cy'], u);
      }
      return out;
    }
  }
}
