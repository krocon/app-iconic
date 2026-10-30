import { JsonValue } from '../../core/icon-file/icon-file.models';
import { Rect } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { apply, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';

/**
 * Icon Composer's `position` of a group or layer (prompt 080; semantics of design 004 E4, backed
 * by real files – design 080 "Belege"): a uniform `scale` about the canvas centre, then
 * `translation-in-points` with y down. Pure.
 */
export interface LayerPosition {
  scale: number;
  tx: number;
  ty: number;
}

export const NO_POSITION: LayerPosition = { scale: 1, tx: 0, ty: 0 };
/** Smallest scale a drag leaves (a layer of scale 0 could not be grabbed again). */
export const MIN_SCALE = 0.01;
export const MAX_SCALE = 100;

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A `position` value as numbers; a missing or broken one is the identity. */
export function readPosition(v: unknown): LayerPosition {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return NO_POSITION;
  const o = v as Record<string, unknown>;
  const t = o['translation-in-points'];
  const pair = Array.isArray(t) && t.length === 2 ? t : [0, 0];
  return { scale: num(o['scale'], 1), tx: num(pair[0], 0), ty: num(pair[1], 0) };
}

/** `translate(c + t) scale(s) translate(−c)` as a matrix (= `layerTransform`, 004 E4). */
export function positionMatrix(p: LayerPosition, size = CANVAS_SIZE): Matrix {
  const c = size / 2;
  return {
    a: p.scale,
    b: 0,
    c: 0,
    d: p.scale,
    e: c + p.tx - p.scale * c,
    f: c + p.ty - p.scale * c,
  };
}

const round = (v: number, step: number) => Math.round(v / step) * step;
/** Rounded like a hand-typed value: points to 0.01, the scale to 0.0001 (no float noise). */
export function roundPosition(p: LayerPosition): LayerPosition {
  const clean = (v: number, step: number) => Number(round(v, step).toFixed(6)) || 0;
  return { scale: clean(p.scale, 0.0001), tx: clean(p.tx, 0.01), ty: clean(p.ty, 0.01) };
}

/**
 * The JSON value for `p`: the old object with `scale` and `translation-in-points` set (other keys
 * kept, in their order); a new one in Icon Composer's key order.
 */
export function positionValue(old: unknown, p: LayerPosition): JsonValue {
  const r = roundPosition(p);
  const base =
    typeof old === 'object' && old !== null && !Array.isArray(old)
      ? (old as Record<string, JsonValue>)
      : {};
  return { ...base, scale: r.scale, 'translation-in-points': [r.tx, r.ty] };
}

/** Moved by `delta` document units; the translation lives inside the group's scale. */
export function movedPosition(p: LayerPosition, delta: Point, groupScale: number): LayerPosition {
  const g = groupScale || 1;
  return { ...p, tx: p.tx + delta.x / g, ty: p.ty + delta.y / g };
}

/**
 * Scaled by `k` about `centre` (a point of the asset, before the position): that point stays where
 * it is – `t' = t + (s − s')(centre − c)`. The scale is kept in [MIN_SCALE, MAX_SCALE].
 */
export function scaledPosition(
  p: LayerPosition,
  centre: Point,
  k: number,
  size = CANVAS_SIZE,
): LayerPosition {
  const c = size / 2;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale * (Number.isFinite(k) ? k : 1)));
  return {
    scale,
    tx: p.tx + (p.scale - scale) * (centre.x - c),
    ty: p.ty + (p.scale - scale) * (centre.y - c),
  };
}

/** The four corners of `box` (top-left, top-right, bottom-right, bottom-left) mapped by `m`. */
export function frameCorners(m: Matrix, box: Rect): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((p) => apply(m, p));
}

export function boxCentre(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** An image larger than the canvas fits it on import (prompt 080 E3); `null` = natural size. */
export function fitScale(width: number, height: number, size = CANVAS_SIZE): number | null {
  const max = Math.max(width, height);
  return max > size ? Number((size / max).toFixed(6)) : null;
}

/** Where a layer may snap to on the canvas: corners, edge middles and the centre. */
export function canvasMarks(size = CANVAS_SIZE): Point[] {
  const h = size / 2;
  const out: Point[] = [];
  for (const y of [0, h, size]) for (const x of [0, h, size]) out.push({ x, y });
  return out;
}
