import { Point } from '../view-transform';
import { sidesOf } from './polygon';
import { degFromVector, dist, sub } from './sketch-shapes';
import { heightAcross, Locks, Placed, shapeOf, SketchToolId } from './sketch-tools';

/**
 * What the dimension fields show for the current step, from its resolved point (design 019 E6).
 * Pure.
 */

/** The values the fields show for the current step (from its resolved point). */
export function measure(tool: SketchToolId, placed: readonly Placed[], cur: Placed): Locks {
  const a = placed[0]?.p;
  if (!a) return {};
  const p = cur.p;
  const step = placed.length;
  const deg = (v: Point) => degFromVector(v);
  switch (tool) {
    case 'line':
      return { length: dist(a, p), angle: deg(sub(p, a)) };
    case 'rect3p':
      if (step === 1) return { length: dist(a, p), angle: deg(sub(p, a)) };
      return { height: Math.abs(heightAcross(a, placed[1].p, p)) };
    case 'midpointLine':
      return { length: 2 * dist(a, p), angle: deg(sub(p, a)) };
    case 'rect2p':
      return { width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) };
    case 'rectCenter':
      return { width: 2 * Math.abs(p.x - a.x), height: 2 * Math.abs(p.y - a.y) };
    case 'circleCenter':
      return { diameter: 2 * dist(a, p) };
    case 'circle2p':
      return { diameter: dist(a, p), angle: deg(sub(p, a)) };
    case 'circle2t': {
      const s = shapeOf(tool, placed, cur);
      return s?.kind === 'circle' ? { diameter: 2 * s.r } : {};
    }
    case 'arc3p': {
      const s = shapeOf(tool, placed, cur);
      return s?.kind === 'arc' ? { radius: s.r } : {};
    }
    case 'arcCenter':
      if (step === 1) return { radius: dist(a, p), start: deg(sub(p, a)) };
      return { sweep: (-(cur.sweep ?? 0) * 180) / Math.PI };
    case 'arcTangent': {
      const s = shapeOf(tool, placed, cur);
      return s?.kind === 'arc' ? { radius: s.r, sweep: (Math.abs(s.sweep) * 180) / Math.PI } : {};
    }
    case 'polygonCircumscribed':
    case 'polygonInscribed':
      return { sides: sidesOf(cur.locks?.sides), diameter: 2 * dist(a, p), angle: deg(sub(p, a)) };
    case 'polygonEdge':
      if (step !== 1) return {};
      return { sides: sidesOf(cur.locks?.sides), length: dist(a, p), angle: deg(sub(p, a)) };
    default:
      return {};
  }
}
