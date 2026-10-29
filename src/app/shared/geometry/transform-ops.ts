import { Matrix, multiply } from './matrix';
import { Point } from './view-transform';

/**
 * Transform with numbers and a reference point (prompt 053, like Illustrator's Transform Each /
 * Fusion's Move): move, rotate, scale and reflect in document space, about a pivot. Pure.
 */

export type Reflect = 'none' | 'horizontal' | 'vertical';

export interface TransformSpec {
  dx: number;
  dy: number;
  /** Degrees, clockwise on screen (y down) like SVG `rotate()`. */
  rotate: number;
  sx: number;
  sy: number;
  /** Horizontal = mirrored left ↔ right (across a vertical axis). */
  reflect: Reflect;
}

export const IDENTITY_SPEC: TransformSpec = {
  dx: 0,
  dy: 0,
  rotate: 0,
  sx: 1,
  sy: 1,
  reflect: 'none',
};

/** The nine reference points of a box (Illustrator's proxy). */
export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';
export const ANCHORS: readonly Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function anchorPoint(b: Box, a: Anchor): Point {
  const fx = a.endsWith('l') ? 0 : a.endsWith('r') ? 1 : 0.5;
  const fy = a.startsWith('t') ? 0 : a.startsWith('b') ? 1 : 0.5;
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

const T = (x: number, y: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });

/** The change of `spec` about `pivot`: scale, reflect, rotate there, then move. */
export function specMatrix(spec: TransformSpec, pivot: Point): Matrix {
  const r = (spec.rotate * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const fx = spec.reflect === 'horizontal' ? -1 : 1;
  const fy = spec.reflect === 'vertical' ? -1 : 1;
  const rot: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const scale: Matrix = { a: spec.sx * fx, b: 0, c: 0, d: spec.sy * fy, e: 0, f: 0 };
  const around = multiply(
    T(pivot.x, pivot.y),
    multiply(rot, multiply(scale, T(-pivot.x, -pivot.y))),
  );
  return multiply(T(spec.dx, spec.dy), around);
}

/** The angle (degrees) from `a` to `b` seen from `pivot`, ⇧-snapped to `step` degrees. */
export function dragAngle(pivot: Point, a: Point, b: Point, step = 0): number {
  const deg =
    ((Math.atan2(b.y - pivot.y, b.x - pivot.x) - Math.atan2(a.y - pivot.y, a.x - pivot.x)) * 180) /
    Math.PI;
  const norm = ((deg + 540) % 360) - 180;
  return step > 0 ? Math.round(norm / step) * step : norm;
}

/** The scale that takes `a` to `b` about `pivot` (per axis; `uniform` keeps the ratio). */
export function dragScale(
  pivot: Point,
  a: Point,
  b: Point,
  uniform: boolean,
): { sx: number; sy: number } {
  const ax = a.x - pivot.x;
  const ay = a.y - pivot.y;
  if (uniform) {
    const la = Math.hypot(ax, ay);
    const k = la > 1e-9 ? Math.hypot(b.x - pivot.x, b.y - pivot.y) / la : 1;
    return { sx: k, sy: k };
  }
  return {
    sx: Math.abs(ax) > 1e-6 ? (b.x - pivot.x) / ax : 1,
    sy: Math.abs(ay) > 1e-6 ? (b.y - pivot.y) / ay : 1,
  };
}
