import { describe, expect, it } from 'vitest';
import { parsePath, PathSeg } from './path-data';
import { distanceToSegment, optimizePath, rdpWithCorners } from './path-optimize';
import { Point } from './view-transform';

/**
 * The cases of the template's `AppIconicTests/SVGPathOptimizerTests.swift` (design 011 E11):
 * `template` is what the Swift optimizer returned (numbers truncated, every further `L`
 * dropped), `expected` what this one returns with precision 0 (rounded, shortest form).
 */
const TEMPLATE_CASES = [
  {
    name: 'removes extra L and rounds numbers',
    input: 'M0 0 L100.4 200.6 L100.4 200.6 L150.9 250.2',
    epsilon: 1,
    template: 'M0 0 L 100 200 150 250',
    expected: 'M0 0L100 201l51 49',
  },
  {
    name: 'removes duplicate sequential points',
    input: 'M0 0 L10 10 L10 10 L5 15',
    epsilon: 1,
    template: 'M0 0 L 10 10 5 15',
    expected: 'M0 0L10 10 5 15',
  },
  {
    name: 'RDP simplifies collinear points',
    input: 'M0 0 L5 0 L10 0 L15 0 L20 0',
    epsilon: 0.5,
    template: 'M0 0 L 20 0',
    expected: 'M0 0H20',
  },
  {
    name: 'curved path: rounding, the curve stays',
    input: 'M0 0 C10.4 20.2 30.9 40.1 50.6 60.3 L70.7 80.8',
    epsilon: 1,
    template: 'M0 0 C10 20 30 40 50 60 L70 80',
    expected: 'M0 0C10 20 31 40 51 60L71 81',
  },
] as const;

describe('optimizePath – template cases', () => {
  for (const c of TEMPLATE_CASES) {
    it(c.name, () => {
      expect(optimizePath(c.input, { epsilon: c.epsilon, precision: 0 })?.d).toBe(c.expected);
    });
  }
});

describe('optimizePath', () => {
  it('returns null for invalid path data', () => {
    expect(optimizePath('L10 10')).toBeNull();
    expect(optimizePath('M0 0 L1')).toBeNull();
  });

  it('counts points before and after', () => {
    const r = optimizePath('M0 0 L5 0 L10 0 L15 0 L20 0 Z')!;
    expect(r.pointsBefore).toBe(5);
    expect(r.pointsAfter).toBeLessThan(5);
  });

  it('keeps corners (a square stays a square)', () => {
    const r = optimizePath('M0 0 L100 0 L100 100 L0 100 Z', { epsilon: 50 })!;
    expect(r.d).toBe('M0 0H100V100H0Z');
  });

  it('drops a line back to the start before Z', () => {
    expect(optimizePath('M0 0 L10 0 L0 10 L0 0 Z')!.d).toBe('M0 0H10L0 10Z');
  });

  it('drops zero-length segments and a moveto that starts nothing', () => {
    expect(optimizePath('M5 5 M0 0 L0 0 C0 0 0 0 0 0 L10 10')!.d).toBe('M0 0L10 10');
    expect(optimizePath('M0 0 A5 5 0 0 1 0 0 L3 4')!.d).toBe('M0 0L3 4');
  });

  it('simplifies runs of lines between curves', () => {
    const r = optimizePath('M0 0 C10 10 20 10 30 0 L40 0 L50 0 L60 0 C70 10 80 10 90 0')!;
    expect(r.d).toBe('M0 0C10 10 20 10 30 0H60C70 10 80 10 90 0');
  });

  it('writes the shorter of relative and absolute, S/T where the reflection fits', () => {
    expect(optimizePath('M100 100 L101 102 L103 101')!.d).toBe('M100 100l1 2 2-1');
    expect(optimizePath('M0 0 C0 10 10 10 10 0 C10 -10 20 -10 20 0')!.d).toBe(
      'M0 0C0 10 10 10 10 0S20-10 20 0',
    );
    expect(optimizePath('M0 0 Q5 10 10 0 Q15 -10 20 0')!.d).toBe('M0 0Q5 10 10 0T20 0');
  });

  it('rounds to the precision, -0 becomes 0', () => {
    expect(optimizePath('M0.12345 -0.0001 L10.98765 3.33333', { precision: 2 })!.d).toBe(
      'M0.12 0L10.99 3.33',
    );
  });

  it('relative numbers come from the rounded points (no drift)', () => {
    const d = 'M0 0' + ' l0.4 0.4'.repeat(10);
    const r = optimizePath(d, { precision: 0, epsilon: 0 })!;
    // the end stays at (4, 4) – rounding every delta would end at (0, 0)
    expect(endPoint(r.d)).toEqual({ x: 4, y: 4 });
  });

  it('keeps arcs with their flags', () => {
    expect(optimizePath('M10 10 a5 5 0 0110 0')!.d).toBe('M10 10a5 5 0 0 1 10 0');
  });

  it('is stable when run twice', () => {
    const d = 'M3.5 7.25 L10 7.25 L20 7.3 L30 7.25 C40 0 50 0 60 10 L60 20 L60 30 Z';
    const once = optimizePath(d)!.d;
    expect(optimizePath(once)!.d).toBe(once);
  });
});

describe('rdpWithCorners', () => {
  it('keeps the ends and every point beyond epsilon', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 1 },
      { x: 10, y: 0 },
    ];
    expect(rdpWithCorners(pts, 1)).toHaveLength(3); // the bend is a corner
    expect(
      rdpWithCorners(
        pts.map((p) => ({ x: p.x * 10, y: p.y })),
        1,
      ),
    ).toHaveLength(2);
  });
});

// ---- property: deviation ≤ epsilon (+ rounding), sampled on the curve ----

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  const k = (p: number, q: number, r: number, s: number) =>
    u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s;
  return { x: k(a.x, b.x, c.x, d.x), y: k(a.y, b.y, c.y, d.y) };
}

/** Points along the path (lines and cubics; the test paths have nothing else). */
function sample(segs: readonly PathSeg[], steps = 16): Point[] {
  const out: Point[] = [];
  for (const s of segs) {
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (s.cmd === 'C' || s.cmd === 'S') out.push(cubic(s.start, s.c1!, s.c2!, s.p, t));
      else
        out.push({
          x: s.start.x + (s.p.x - s.start.x) * t,
          y: s.start.y + (s.p.y - s.start.y) * t,
        });
    }
  }
  return out;
}

function distanceToPath(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++)
    best = Math.min(best, distanceToSegment(p, poly[i - 1], poly[i]));
  return best;
}

function endPoint(d: string): Point {
  return parsePath(d)!.at(-1)!.p;
}

describe('optimizePath – deviation ≤ epsilon', () => {
  const precision = 3;
  const rounding = 0.5 * 10 ** -precision * Math.SQRT2;

  it('for random polylines', () => {
    const rnd = random(11);
    for (let run = 0; run < 60; run++) {
      const epsilon = 0.25 + rnd() * 3;
      let p = { x: rnd() * 500, y: rnd() * 500 };
      let dir = rnd() * Math.PI * 2;
      let d = `M${p.x} ${p.y}`;
      for (let k = 0; k < 40; k++) {
        dir += (rnd() - 0.5) * 0.3;
        const len = 1 + rnd() * 8;
        p = { x: p.x + Math.cos(dir) * len, y: p.y + Math.sin(dir) * len };
        d += ` L${p.x} ${p.y}`;
      }
      const r = optimizePath(d, { epsilon, precision })!;
      const after = sample(parsePath(r.d)!, 1);
      for (const q of sample(parsePath(d)!, 4)) {
        expect(distanceToPath(q, after)).toBeLessThanOrEqual(epsilon + rounding + 1e-9);
      }
      expect(r.pointsAfter).toBeLessThanOrEqual(r.pointsBefore);
    }
  });

  it('for paths mixing curves and lines', () => {
    const rnd = random(7);
    for (let run = 0; run < 30; run++) {
      const epsilon = 0.5 + rnd() * 2;
      let d = 'M0 0';
      let x = 0;
      for (let k = 0; k < 12; k++) {
        if (rnd() < 0.4) {
          d += ` C${x + 5} ${rnd() * 40} ${x + 15} ${rnd() * 40} ${x + 20} ${rnd() * 10}`;
          x += 20;
        } else {
          x += 3 + rnd() * 5;
          d += ` L${x} ${rnd() * 2}`;
        }
      }
      const r = optimizePath(d, { epsilon, precision })!;
      const after = sample(parsePath(r.d)!, 64);
      for (const q of sample(parsePath(d)!, 16)) {
        expect(distanceToPath(q, after)).toBeLessThanOrEqual(epsilon + rounding + 0.05);
      }
    }
  });
});
