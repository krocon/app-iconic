import { Point } from '../view-transform';
import {
  pickByPointer,
  pickNearestCenter,
  pickSmallest,
  sideOf,
  Tangent,
  tangentCircles,
} from './apollonius';
import { Circle, dist, dot, normal, sub } from './sketch-shapes';

const line = (a: Point, b: Point): Tangent => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return { kind: 'line', p: a, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
};
const circle = (x: number, y: number, r: number): Tangent => ({ kind: 'circle', c: { x, y }, r });

/** Distance of a circle from touching a target. */
function miss(t: Tangent, s: Circle): number {
  if (t.kind === 'line') return Math.abs(Math.abs(dot(normal(t.d), sub(s.c, t.p))) - s.r);
  const d = dist(s.c, t.c);
  return Math.min(Math.abs(d - (t.r + s.r)), Math.abs(d - Math.abs(t.r - s.r)));
}

describe('circles tangent to lines and circles (design 019 E9)', () => {
  // triangle (0,0) (400,0) (0,300): sides 400, 300, 500 → inradius (3+4−5)/2·100 = 100
  const A = { x: 0, y: 0 };
  const B = { x: 400, y: 0 };
  const C = { x: 0, y: 300 };
  const tri = [line(A, B), line(B, C), line(C, A)];

  it('three lines: the incircle and the three excircles', () => {
    const all = tangentCircles(tri);
    expect(all.length).toBe(4);
    for (const s of all) for (const t of tri) expect(miss(t, s)).toBeLessThan(1e-6);
    const inc = pickByPointer(all, { x: 80, y: 80 })!;
    expect(inc.r).toBeCloseTo(100, 9);
    expect(inc.c.x).toBeCloseTo(100, 9);
    expect(inc.c.y).toBeCloseTo(100, 9);
  });

  it('parallel lines and a third line: two circles between them', () => {
    const all = tangentCircles([
      line({ x: 0, y: 0 }, { x: 1, y: 0 }),
      line({ x: 0, y: 100 }, { x: 1, y: 100 }),
      line({ x: 300, y: -50 }, { x: 300, y: 50 }),
    ]);
    expect(all.length).toBe(2);
    for (const s of all) {
      expect(s.r).toBeCloseTo(50, 9);
      expect(s.c.y).toBeCloseTo(50, 9);
    }
  });

  it('a line and two circles; three circles', () => {
    const targets = [
      line({ x: 0, y: 400 }, { x: 1, y: 400 }),
      circle(300, 200, 60),
      circle(600, 250, 90),
    ];
    const all = tangentCircles(targets);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) for (const t of targets) expect(miss(t, s)).toBeLessThan(1e-6);
    const three = [circle(200, 200, 50), circle(500, 220, 80), circle(350, 500, 60)];
    const sols = tangentCircles(three);
    // Apollonius: eight circles for three disjoint circles
    expect(sols.length).toBe(8);
    for (const s of sols) for (const t of three) expect(miss(t, s)).toBeLessThan(1e-6);
  });

  it('two targets and a point on the circle', () => {
    const l1 = line({ x: 0, y: 0 }, { x: 1, y: 0 });
    const l2 = line({ x: 0, y: 0 }, { x: 0, y: 1 });
    const p = { x: 100, y: 50 };
    const sols = tangentCircles([l1, l2], { point: p, sides: [sideOf(l1, p), sideOf(l2, p)] });
    expect(sols.length).toBe(2);
    for (const s of sols) {
      expect(dist(s.c, p)).toBeCloseTo(s.r, 9);
      expect(s.c.x).toBeCloseTo(s.r, 9);
      expect(s.c.y).toBeCloseTo(s.r, 9);
    }
    // r² − 300 r + 12 500 = 0 → r = 150 ± √10 000 = 50 or 250
    expect(pickSmallest(sols)!.r).toBeCloseTo(50, 9);
  });

  it('two targets and a fixed radius: the centre nearest to the pointer', () => {
    const l = line({ x: 0, y: 300 }, { x: 1, y: 300 });
    const c = circle(400, 200, 50);
    const sols = tangentCircles([l, c], { radius: 40 });
    expect(sols.length).toBeGreaterThan(0);
    for (const s of sols) {
      expect(s.r).toBe(40);
      expect(miss(l, s)).toBeLessThan(1e-6);
      expect(miss(c, s)).toBeLessThan(1e-6);
    }
    const near = pickNearestCenter(sols, { x: 330, y: 260 })!;
    expect(near.c.y).toBeCloseTo(260, 6);
    expect(near.c.x).toBeLessThan(400);
  });

  it('needs exactly three conditions', () => {
    expect(tangentCircles([line(A, B)])).toEqual([]);
    expect(tangentCircles(tri, { radius: 10 })).toEqual([]);
  });
});
