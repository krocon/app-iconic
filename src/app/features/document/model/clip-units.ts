import { invert, Matrix, multiply } from '../../../shared/geometry/matrix';
import { transformItems } from '../../../shared/geometry/transform-text';
import { ClipRect } from './clip-model';

/**
 * `clipPathUnits` (design 014 E8). With `objectBoundingBox` the clip's user space is the owner's
 * bounding box: `U = translate(b.x b.y) scale(b.w b.h)`. Switching keeps the picture for the owner
 * by changing the `transform` of the `<clipPath>`: to OBB `T' = U⁻¹ · T`, back `T' = U · T`. A
 * leading `matrix`/`translate` is folded in (no growing chain when switching back and forth).
 * Numbers with 10 significant digits – 4 decimals would not be exact for `1/b.w`. Pure.
 */

export type ClipUnits = 'userSpaceOnUse' | 'objectBoundingBox';

export const CLIP_UNITS: readonly ClipUnits[] = ['userSpaceOnUse', 'objectBoundingBox'];

/** The units of a `<clipPath>` (missing or unknown = `userSpaceOnUse`, the SVG default). */
export function clipUnitsOf(clip: Element): ClipUnits {
  return clip.getAttribute('clipPathUnits')?.trim() === 'objectBoundingBox'
    ? 'objectBoundingBox'
    : 'userSpaceOnUse';
}

export function unitsMatrix(b: ClipRect): Matrix {
  return { a: b.width, b: 0, c: 0, d: b.height, e: b.x, f: b.y };
}

function num(v: number): string {
  const r = Number(v.toPrecision(10));
  return String(Math.abs(r) < 1e-12 ? 0 : r);
}

const nearly = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function isIdentity(m: Matrix): boolean {
  return (
    nearly(m.a, 1) &&
    nearly(m.b, 0) &&
    nearly(m.c, 0) &&
    nearly(m.d, 1) &&
    nearly(m.e, 0) &&
    nearly(m.f, 0)
  );
}

function text(m: Matrix): string {
  if (nearly(m.a, 1) && nearly(m.b, 0) && nearly(m.c, 0) && nearly(m.d, 1)) {
    return `translate(${num(m.e)} ${num(m.f)})`;
  }
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(num).join(' ')})`;
}

/** `m · transform` with a leading `matrix`/`translate` folded in; `null` = no transform left. */
export function prependExact(transform: string | null, m: Matrix): string | null {
  const old = (transform ?? '').trim();
  const first = transformItems(old)[0];
  let lead: Matrix | null = null;
  if (first && old.slice(0, first.start).trim() === '') {
    const a = first.args;
    if (first.name === 'matrix' && a.length === 6) {
      lead = { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] };
    } else if (first.name === 'translate' && (a.length === 1 || a.length === 2)) {
      lead = { a: 1, b: 0, c: 0, d: 1, e: a[0], f: a[1] ?? 0 };
    }
  }
  const rest = lead ? old.slice(first!.end).replace(/^\s*,?\s*/, '') : old;
  const merged = lead ? multiply(m, lead) : m;
  const head = isIdentity(merged) ? '' : text(merged);
  const out = [head, rest].filter(Boolean).join(' ').trim();
  return out ? out : null;
}

/**
 * The `transform` of the `<clipPath>` after switching from `from` to `to` units for an owner with
 * bounding box `b`; `undefined` if it cannot be converted (empty box).
 */
export function convertUnitsTransform(
  transform: string | null,
  b: ClipRect,
  from: ClipUnits,
  to: ClipUnits,
): string | null | undefined {
  if (from === to) return transform;
  if (!(b.width > 0) || !(b.height > 0)) return undefined;
  const u = unitsMatrix(b);
  const m = to === 'objectBoundingBox' ? invert(u) : u;
  return m ? prependExact(transform, m) : undefined;
}
