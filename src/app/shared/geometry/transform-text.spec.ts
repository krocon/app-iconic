import { applyLinear, invert, multiply } from './matrix';
import {
  affineText,
  appendAffine,
  prependAffine,
  setItemArgs,
  transformItems,
} from './transform-text';

const T = (x: number, y: number) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });

describe('transform text (design 007 E11)', () => {
  it('puts a move in front, folded into a leading translate / matrix', () => {
    expect(prependAffine(null, T(1, 2))).toBe('translate(1 2)');
    expect(prependAffine('rotate(30)', T(1, 0))).toBe('translate(1 0) rotate(30)');
    expect(prependAffine('translate(10,5) rotate(30 5 5)', T(1, 0))).toBe(
      'translate(11 5) rotate(30 5 5)',
    );
    expect(prependAffine(' translate(10) scale(2)', T(0, 3))).toBe('translate(10 3) scale(2)');
    expect(prependAffine('matrix(2 0 0 2 10 10)', T(1, 1))).toBe('matrix(2 0 0 2 11 11)');
    expect(prependAffine('translate(1 2)', T(-1, -2))).toBe('');
    expect(prependAffine('scale(2)', T(0, 0))).toBe('scale(2)');
  });

  it('puts a scale at the end, folded into a trailing translate / matrix', () => {
    const s = { a: 2, b: 0, c: 0, d: 3, e: -10, f: -20 };
    expect(appendAffine('rotate(20)', s)).toBe('rotate(20) matrix(2 0 0 3 -10 -20)');
    expect(appendAffine('rotate(20) translate(5 5)', T(1, 1))).toBe('rotate(20) translate(6 6)');
    expect(appendAffine('', s)).toBe('matrix(2 0 0 3 -10 -20)');
    expect(affineText(T(1.23456, -0))).toBe('translate(1.2346 0)');
  });

  // template: testOptionTranslationUpdatesPathTransformOnly – the moved node's matrix is
  // T(local) applied first: the same as a translate by A⁻¹·d of the parent put in front
  it('a document move prepended in the parent space equals the template result', () => {
    const parent = { a: 1.1, b: 0, c: 0, d: 0.9, e: 18, f: -36 };
    const rot = Math.PI / 9;
    const own = multiply(
      { a: Math.cos(rot), b: Math.sin(rot), c: -Math.sin(rot), d: Math.cos(rot), e: 0, f: 0 },
      { a: 0.95, b: 0, c: 0, d: 1.2, e: 0, f: 0 },
    );
    const d = { x: 15, y: -22 };
    const combined = multiply(parent, own);
    const lin = { ...combined, e: 0, f: 0 };
    const local = applyLinear(invert(lin)!, d);
    const expected = multiply(own, T(local.x, local.y)); // original · T(local)
    const pinv = invert({ ...parent, e: 0, f: 0 })!;
    const l = applyLinear(pinv, d);
    const got = multiply(T(l.x, l.y), own); // translate(A⁻¹d) · original
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const)
      expect(got[k]).toBeCloseTo(expected[k], 9);
  });
});

describe('transform items (design 007 E7 pivot)', () => {
  it('lists the functions and rewrites one of them', () => {
    const t = 'translate(10, 5) rotate(30 5 5)scale(2)';
    expect(transformItems(t).map((i) => [i.name, i.args])).toEqual([
      ['translate', [10, 5]],
      ['rotate', [30, 5, 5]],
      ['scale', [2]],
    ]);
    expect(setItemArgs(t, 1, [30, 7.5, 8])).toBe('translate(10, 5) rotate(30 7.5 8)scale(2)');
    expect(setItemArgs(t, 9, [1])).toBe(t);
    expect(transformItems(null)).toEqual([]);
  });
});
