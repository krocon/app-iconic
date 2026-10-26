import {
  apply,
  applyLinear,
  conjugate,
  invert,
  isTranslation,
  multiply,
  translation,
} from './matrix';

describe('matrix (design 007 E1)', () => {
  const m = { a: 1.2, b: 0.3, c: -0.4, d: 0.9, e: 32, f: -18 };

  it('multiplies like DOMMatrix (right first) and inverts', () => {
    const t = translation(5, 7);
    expect(apply(multiply(m, t), { x: 0, y: 0 })).toEqual(apply(m, { x: 5, y: 7 }));
    const inv = invert(m)!;
    const p = apply(inv, apply(m, { x: 3, y: -4 }));
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.y).toBeCloseTo(-4, 9);
    expect(invert({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toBeNull();
  });

  it('linear part, translation test and conjugation', () => {
    expect(applyLinear(translation(9, 9), { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(isTranslation(translation(3, 4))).toBe(true);
    expect(isTranslation(m)).toBe(false);
    // a move by (10, 0) in document space, expressed in a scaled parent space
    const parent = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 0 };
    const local = conjugate(translation(10, 0), parent)!;
    expect(local.e).toBeCloseTo(5, 9);
    expect(isTranslation(local)).toBe(true);
  });
});
