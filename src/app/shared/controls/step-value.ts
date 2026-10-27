/**
 * Stepping a number field (design 009 E10, legacy `SteppedSlider`): ±step per key, ⇧ × 10,
 * clamped to the range, rounded to the precision of the step; a unit (`50%`) stays. Pure.
 */

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?`;
const VALUE = new RegExp(String.raw`^\s*(${NUM})\s*([a-z%]*)\s*$`, 'i');

export interface Range {
  min?: number;
  max?: number;
  step?: number;
}

/** Number and unit of a field text; `null` if it is no number (with `units`: a unit may follow). */
export function readNumber(text: string, units: boolean): { n: number; unit: string } | null {
  const m = VALUE.exec(text);
  if (!m || (!units && m[2])) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? { n, unit: m[2] } : null;
}

function decimals(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function clamp(n: number, r: Range): number {
  let v = n;
  if (r.min !== undefined) v = Math.max(r.min, v);
  if (r.max !== undefined) v = Math.min(r.max, v);
  return v;
}

/** `n` rounded to the precision of the step (at most 4 decimals), as text. */
export function formatStep(n: number, step = 1): string {
  const d = Math.min(4, Math.max(decimals(step), 0));
  const r = Number(n.toFixed(Math.max(d, 0)));
  return String(r === 0 ? 0 : r);
}

/** The text after `delta` steps from `text` (or from `base` when the text is no number). */
export function stepText(text: string, delta: number, r: Range, units: boolean, base = 0): string {
  const cur = readNumber(text, units) ?? { n: base, unit: '' };
  const step = r.step ?? 1;
  return formatStep(clamp(cur.n + delta * step, r), step) + cur.unit;
}
