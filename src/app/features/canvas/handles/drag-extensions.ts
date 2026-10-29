import { apply, applyLinear, Matrix } from '../../../shared/geometry/matrix';
import { Point } from '../../../shared/geometry/view-transform';
import { HandleRole } from './handle-types';
import { NodeGeometry } from './node-geometry';

/**
 * The lines a dragged point keeps to (prompt 040; VectorCraft's Line Extension): the straight
 * segments it ends, from their end that stays put, in DOCUMENT units through `toDoc`. A line end
 * keeps to its own line, a polyline / polygon vertex to the segments to its neighbours. Pure.
 */
export function dragExtensions(
  g: NodeGeometry,
  role: HandleRole,
  toDoc: Matrix,
): { at: Point; dir: Point }[] {
  const ray = (fixed: Point, moving: Point) => ({
    at: apply(toDoc, fixed),
    dir: applyLinear(toDoc, { x: moving.x - fixed.x, y: moving.y - fixed.y }),
  });
  if (g.kind === 'line' && role.t === 'lineEnd') {
    const a = { x: g.x1, y: g.y1 };
    const b = { x: g.x2, y: g.y2 };
    return [role.end === 1 ? ray(b, a) : ray(a, b)];
  }
  if (g.kind === 'poly' && role.t === 'vertex') {
    const n = g.points.length;
    const i = role.index;
    const p = g.points[i];
    if (!p || n < 2) return [];
    const near = [i - 1, i + 1]
      .map((j) => (g.closed ? (j + n) % n : j))
      .filter((j) => j >= 0 && j < n && j !== i);
    return near.map((j) => ray(g.points[j], p)).filter((r) => Math.hypot(r.dir.x, r.dir.y) > 1e-9);
  }
  return [];
}
