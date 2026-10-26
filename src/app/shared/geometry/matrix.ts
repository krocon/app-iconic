import { Point } from './view-transform';

/**
 * A 2-D affine matrix as plain numbers (`[a c e; b d f]`, the SVG / DOMMatrix layout). Pure – the
 * browser measures (`getScreenCTM`, design 004 E11), these helpers only combine the measured
 * matrices without the DOM, so the edit maths runs in Vitest (design 007 E1).
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** The six numbers of a DOMMatrix / SVGMatrix. */
export function fromDom(m: Matrix): Matrix {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

/** `m · n` – applies `n` first, then `m` (like `DOMMatrix.multiply`). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

/** The inverse, `null` if the matrix is singular. */
export function invert(m: Matrix): Matrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Only the linear part (for vectors / deltas). */
export function applyLinear(m: Matrix, v: Point): Point {
  return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
}

export function translation(x: number, y: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function isTranslation(m: Matrix, eps = 1e-9): boolean {
  return (
    Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps
  );
}

/** `P⁻¹ · M · P`: a change `M` given in the space `P` maps to, expressed in the space of `P`. */
export function conjugate(m: Matrix, p: Matrix): Matrix | null {
  const inv = invert(p);
  return inv ? multiply(inv, multiply(m, p)) : null;
}
