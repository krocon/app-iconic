import {
  curvatureSpline,
  curveAnchor,
  insertAnchor,
  moveAnchor,
  nearestOnSegment,
  segmentCurve,
  smoothHandles,
} from './curvature';
import { singlePath } from './pen-path';

const cubic = (c: ReturnType<typeof segmentCurve>, t: number) => {
  const [p0, p1, p2, p3] = c!;
  const s = 1 - t;
  return {
    x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
    y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
  };
};

describe('curvature rule (prompt 043, from VectorCraft draw2.rs)', () => {
  it('three points on a circle: the handles lie on its tangent, the curve close to the circle', () => {
    // a quarter of the unit circle (scaled): (100,0), (70.7,70.7), (0,100)
    const r = 100;
    const pts = [0, 45, 90].map((deg) => ({
      p: { x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) },
    }));
    const [hin, hout] = smoothHandles(pts[0].p, pts[1].p, pts[2].p)!;
    // the tangent at 45° is square to the radius
    const t = { x: hout.x - pts[1].p.x, y: hout.y - pts[1].p.y };
    expect(t.x * pts[1].p.x + t.y * pts[1].p.y).toBeCloseTo(0, 6);
    expect(hin.x - pts[1].p.x).toBeCloseTo(-(hout.x - pts[1].p.x), 9);
    const anchors = curvatureSpline(pts, false);
    // every point of the curve is within 0.5 % of the radius
    for (let s = 0; s < 2; s++) {
      for (let k = 0; k <= 10; k++) {
        const q = cubic(segmentCurve(anchors, s), k / 10);
        expect(Math.abs(Math.hypot(q.x, q.y) - r)).toBeLessThan(0.5);
      }
    }
  });

  it('a tight turn comes to a point; corners and two points stay straight', () => {
    const [hi, ho] = smoothHandles({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 1 })!;
    expect(Math.hypot(hi.x - 100, hi.y)).toBeLessThan(0.1);
    expect(Math.hypot(ho.x - 100, ho.y)).toBeLessThan(0.1);
    const two = curvatureSpline([{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 0 } }], false);
    expect(two.every((a) => !a.hin && !a.hout)).toBe(true);
    const corner = curvatureSpline(
      [{ p: { x: 0, y: 0 } }, { p: { x: 50, y: 50 }, corner: true }, { p: { x: 100, y: 0 } }],
      false,
    );
    expect(corner[1].hin).toBeNull();
  });

  it('a point inserted on a curve keeps its shape; a moved point re-curves its neighbours only', () => {
    const anchors = curvatureSpline(
      [
        { p: { x: 0, y: 0 } },
        { p: { x: 50, y: -40 } },
        { p: { x: 100, y: 0 } },
        { p: { x: 150, y: 40 } },
      ],
      false,
    );
    const before = [0.1, 0.3, 0.5, 0.9].map((t) => cubic(segmentCurve(anchors, 1), t));
    const ins = insertAnchor(anchors, 1, 0.4);
    expect(ins).toHaveLength(5);
    for (const q of before) {
      const best = Math.min(nearestOnSegment(ins, 1, q)!.d, nearestOnSegment(ins, 2, q)!.d);
      expect(best).toBeLessThan(1e-6);
    }
    const moved = moveAnchor(anchors, 1, { x: 50, y: -80 }, false);
    expect(moved[1].p).toEqual({ x: 50, y: -80 });
    expect(moved[3]).toEqual(anchors[3]);
    expect(curveAnchor(anchors, 1, false, false)[1]).toEqual({
      p: anchors[1].p,
      hin: null,
      hout: null,
    });
  });

  it('reads a single path; closing segment on the first point', () => {
    const p = singlePath('M 0 0 C 10 0 20 10 20 20 C 20 30 0 30 0 0 Z')!;
    expect(p.closed).toBe(true);
    expect(p.anchors).toHaveLength(2);
    expect(p.anchors[0].hin).toEqual({ x: 0, y: 30 });
    expect(singlePath('M0 0 L1 1 M2 2 L3 3')).toBeNull();
  });
});
