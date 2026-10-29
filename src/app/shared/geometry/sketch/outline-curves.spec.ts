import { crossings, intersect, nearestOn } from './intersections';
import { cubicAt, ellipseAt, nearestOnCurve, sampleCount } from './outline-curves';

describe('curved outlines (prompt 040)', () => {
  const ellipse = {
    kind: 'curve' as const,
    at: ellipseAt({ x: 0, y: 0 }, 100, 50),
    n: 64,
    closed: true,
  };

  it('ellipse × line: the exact crossings (x²/100² + y²/50² = 1)', () => {
    const ps = intersect(ellipse, { kind: 'segment', a: { x: -200, y: 30 }, b: { x: 200, y: 30 } });
    expect(ps).toHaveLength(2);
    const x = 100 * Math.sqrt(1 - (30 * 30) / (50 * 50));
    for (const p of ps) {
      expect(Math.abs(p.x)).toBeCloseTo(x, 9);
      expect(p.y).toBeCloseTo(30, 9);
    }
  });

  it('ellipse × circle and Bézier × line settle exactly', () => {
    const ps = intersect(ellipse, { kind: 'circle', c: { x: 0, y: 0 }, r: 70 });
    expect(ps).toHaveLength(4);
    for (const p of ps) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(70, 9);
      expect((p.x * p.x) / 10000 + (p.y * p.y) / 2500).toBeCloseTo(1, 9);
    }
    // a symmetric arch from (0,0) to (100,0), top at y = −75; the line y = −50 crosses it twice
    const arch = {
      kind: 'curve' as const,
      at: cubicAt({ x: 0, y: 0 }, { x: 0, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 0 }),
      n: 32,
    };
    const qs = intersect(arch, { kind: 'segment', a: { x: -10, y: -50 }, b: { x: 110, y: -50 } });
    expect(qs).toHaveLength(2);
    for (const q of qs) expect(q.y).toBeCloseTo(-50, 9);
    expect(qs[0].x + qs[1].x).toBeCloseTo(100, 9);
  });

  it('the nearest point of a curve; crossings of a curve with other shapes', () => {
    const q = nearestOnCurve(ellipse, { x: 0, y: -80 });
    expect(q.x).toBeCloseTo(0, 5);
    expect(q.y).toBeCloseTo(-50, 6);
    expect(nearestOn({ kind: 'circle', c: { x: 0, y: 0 }, r: 10 }, { x: 0, y: 30 })).toEqual({
      x: 0,
      y: 10,
    });
    const ps = crossings([
      { owner: 'e', outline: ellipse },
      { owner: 'l', outline: { kind: 'segment', a: { x: 0, y: -100 }, b: { x: 0, y: 100 } } },
    ]);
    expect(ps.map((p) => Math.round(p.y)).sort((a, b) => a - b)).toEqual([-50, 50]);
    expect(sampleCount(10)).toBe(16);
    expect(sampleCount(1e6)).toBe(256);
  });
});
