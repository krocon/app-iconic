import { apply, invert, multiply } from '../../../shared/geometry/matrix';
import { convertUnitsTransform, prependExact, unitsMatrix } from './clip-units';

/** The matrix of a `transform` made only of `matrix(…)` / `translate(…)` (enough for these cases). */
function matrixOf(t: string | null) {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  for (const f of (t ?? '').matchAll(/(matrix|translate|scale)\(([^)]*)\)/g)) {
    const n = f[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const g =
      f[1] === 'matrix'
        ? { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] }
        : f[1] === 'translate'
          ? { a: 1, b: 0, c: 0, d: 1, e: n[0], f: n[1] ?? 0 }
          : { a: n[0], b: 0, c: 0, d: n[1] ?? n[0], e: 0, f: 0 };
    m = multiply(m, g);
  }
  return m;
}

const box = { x: 30, y: 60, width: 333, height: 40 };

describe('clipPathUnits conversion (design 014 E8)', () => {
  it('userSpaceOnUse → objectBoundingBox keeps every point for the owner', () => {
    const t = convertUnitsTransform(null, box, 'userSpaceOnUse', 'objectBoundingBox')!;
    // in OBB the content point p is drawn at U · T' · p; before it was at p
    const total = multiply(unitsMatrix(box), matrixOf(t));
    for (const p of [
      { x: 0, y: 0 },
      { x: 100, y: 77 },
      { x: 1000, y: -5 },
    ]) {
      const q = apply(total, p);
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
    }
  });

  it('there and back gives the old transform (folded, no growing chain)', () => {
    const start = 'rotate(30 5 5)';
    const obb = convertUnitsTransform(start, box, 'userSpaceOnUse', 'objectBoundingBox')!;
    expect(obb.startsWith('matrix(')).toBe(true);
    expect(obb.endsWith('rotate(30 5 5)')).toBe(true);
    const back = convertUnitsTransform(obb, box, 'objectBoundingBox', 'userSpaceOnUse');
    expect(back).toBe('rotate(30 5 5)');
  });

  it('objectBoundingBox → userSpaceOnUse with an existing translate', () => {
    const t = convertUnitsTransform(
      'translate(0.1 0.2)',
      box,
      'objectBoundingBox',
      'userSpaceOnUse',
    );
    // U · translate(0.1 0.2)
    expect(t).toBe('matrix(333 0 0 40 63.3 68)');
  });

  it('same units: unchanged; empty box: not convertible', () => {
    expect(convertUnitsTransform('scale(2)', box, 'userSpaceOnUse', 'userSpaceOnUse')).toBe(
      'scale(2)',
    );
    expect(
      convertUnitsTransform(null, { ...box, width: 0 }, 'userSpaceOnUse', 'objectBoundingBox'),
    ).toBeUndefined();
  });

  it('prependExact folds a leading matrix and drops the identity', () => {
    const u = unitsMatrix(box);
    expect(
      prependExact(`matrix(${[1 / 333, 0, 0, 1 / 40, -30 / 333, -60 / 40].join(' ')})`, u),
    ).toBeNull();
    expect(prependExact(null, invert(u)!)).toMatch(/^matrix\(0\.003003003003 0 0 0\.025 /);
  });
});
