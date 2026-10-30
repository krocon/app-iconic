import { Anchor, anchorPoint, Box } from './transform-ops';
import { apply, applyLinear, Matrix, multiply } from './matrix';
import { Point } from './view-transform';

/**
 * The box of the properties panel's "Transform" head (prompt 062): position, size and rotation of
 * any selection in document units, and the matrix (document space) that a new value means. Pure –
 * the browser measures (`getBBox`, CTM), this only does the arithmetic.
 *
 * A frame is a rectangle with a rotation: `origin` is its top-left corner in its own (rotated)
 * axes, `width`/`height` lengths in document units. One element without skew gets its own rotated
 * frame (like Illustrator's bounding box after a rotation); several elements, or a skewed one, the
 * axis-parallel box (`rotation` 0, `exact` false).
 */
export interface Frame {
  origin: Point;
  width: number;
  height: number;
  /** Degrees, clockwise on screen (y down), in (-180, 180]. */
  rotation: number;
  /** The rotation belongs to one element (else the field rotates relatively). */
  exact: boolean;
}

/** What the user typed (absolute values; `rotateBy` relative). */
export interface BoxEdit {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  rotateBy?: number;
  flipH?: boolean;
  flipV?: boolean;
}

const EPS = 1e-6;
const rad = (deg: number) => (deg * Math.PI) / 180;
const norm180 = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** An axis-parallel frame. */
export function boxFrame(b: Box): Frame {
  return {
    origin: { x: b.x, y: b.y },
    width: b.width,
    height: b.height,
    rotation: 0,
    exact: false,
  };
}

/**
 * The frame of one element: its local bounding box `bbox` (user space) through `m` (user space →
 * document). Skewed (axes not perpendicular): the axis-parallel box instead.
 */
export function elementFrame(bbox: Box, m: Matrix): Frame {
  const u = applyLinear(m, { x: 1, y: 0 });
  const v = applyLinear(m, { x: 0, y: 1 });
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  const corners = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x, y: bbox.y + bbox.height },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
  ].map((p) => apply(m, p));
  const skewed = lu < EPS || lv < EPS || Math.abs((u.x * v.x + u.y * v.y) / (lu * lv)) > 1e-6;
  // mirrored (det < 0): the y axis decides, so a flipped element reads as unrotated
  const det = u.x * v.y - u.y * v.x;
  const angle = det >= 0 ? Math.atan2(u.y, u.x) : Math.atan2(v.y, v.x) - Math.PI / 2;
  const rotation = skewed ? 0 : norm180((angle * 180) / Math.PI);
  const f = frameAround(corners, rotation);
  return { ...f, exact: !skewed };
}

/** The smallest frame with `rotation` around `points`. */
function frameAround(points: Point[], rotation: number): Omit<Frame, 'exact'> {
  const c = Math.cos(rad(rotation));
  const s = Math.sin(rad(rotation));
  // coordinates along the frame's axes: ax = (c, s), ay = (-s, c)
  const us = points.map((p) => p.x * c + p.y * s);
  const vs = points.map((p) => -p.x * s + p.y * c);
  const u0 = Math.min(...us);
  const v0 = Math.min(...vs);
  return {
    origin: { x: u0 * c - v0 * s, y: u0 * s + v0 * c },
    width: Math.max(...us) - u0,
    height: Math.max(...vs) - v0,
    rotation,
  };
}

/** A reference point of the frame (document units). */
export function framePoint(f: Frame, a: Anchor): Point {
  const local = anchorPoint({ x: 0, y: 0, width: f.width, height: f.height }, a);
  const c = Math.cos(rad(f.rotation));
  const s = Math.sin(rad(f.rotation));
  return {
    x: f.origin.x + local.x * c - local.y * s,
    y: f.origin.y + local.x * s + local.y * c,
  };
}

/** What the fields show: the reference point and the frame's size and rotation. */
export function frameFields(
  f: Frame,
  a: Anchor,
): { x: number; y: number; width: number; height: number; rotation: number | null } {
  const p = framePoint(f, a);
  return {
    x: p.x,
    y: p.y,
    width: f.width,
    height: f.height,
    rotation: f.exact ? f.rotation : null,
  };
}

const T = (x: number, y: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const R = (deg: number): Matrix => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
};
const S = (sx: number, sy: number): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
/** `m` applied about `p`. */
const about = (p: Point, m: Matrix) => multiply(T(p.x, p.y), multiply(m, T(-p.x, -p.y)));

/**
 * The change (document space) that makes the frame show `edit` – about the reference point `a`;
 * size along the frame's own axes (no skew for a rotated element); `lock` keeps the proportions
 * (the other side follows the one typed). Flips mirror in place (about the frame's centre).
 * `null` = nothing to do or not possible (zero size).
 */
export function boxEditMatrix(f: Frame, a: Anchor, edit: BoxEdit, lock = false): Matrix | null {
  const pivot = framePoint(f, a);
  let m: Matrix | null = null;
  const then = (n: Matrix) => (m = m ? multiply(n, m) : n);

  let kx = 1;
  let ky = 1;
  if (edit.width !== undefined) {
    if (f.width < EPS || !(edit.width > 0)) return null;
    kx = edit.width / f.width;
    if (lock && edit.height === undefined) ky = kx;
  }
  if (edit.height !== undefined) {
    if (f.height < EPS || !(edit.height > 0)) return null;
    ky = edit.height / f.height;
    if (lock && edit.width === undefined) kx = ky;
  }
  if (Math.abs(kx - 1) > 1e-12 || Math.abs(ky - 1) > 1e-12)
    then(about(pivot, multiply(R(f.rotation), multiply(S(kx, ky), R(-f.rotation)))));

  if (edit.flipH || edit.flipV) {
    const centre = framePoint(f, 'c');
    const flip = S(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
    then(about(centre, multiply(R(f.rotation), multiply(flip, R(-f.rotation)))));
  }

  const turn =
    edit.rotateBy ??
    (edit.rotation !== undefined && f.exact ? norm180(edit.rotation - f.rotation) : 0);
  if (Math.abs(turn) > 1e-12) then(about(pivot, R(turn)));

  if (edit.x !== undefined || edit.y !== undefined) {
    const dx = edit.x !== undefined ? edit.x - pivot.x : 0;
    const dy = edit.y !== undefined ? edit.y - pivot.y : 0;
    if (Math.abs(dx) > 1e-12 || Math.abs(dy) > 1e-12) then(T(dx, dy));
  }
  return m;
}
