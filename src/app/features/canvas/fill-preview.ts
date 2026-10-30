import { IconJson } from '../../core/icon-file/icon-file.models';
import { Appearance, specialized } from './appearance';
import { cssColor, IconColor, parseIconColor, shift } from './icon-color';

/** A point in unit coordinates of the artboard (0,0 top left … 1,1 bottom right). */
export interface UnitPoint {
  x: number;
  y: number;
}

/**
 * What the canvas paints as background (design 004 E7). Colours as CSS (canvas) or, for the
 * export, in the form the caller asks for (`SvgColor`, design 012 E3).
 */
export type FillPreview<C = string> =
  | { kind: 'none' }
  | { kind: 'solid'; color: C }
  | { kind: 'linear'; stops: C[]; start: UnitPoint; stop: UnitPoint }
  | { kind: 'radial'; stops: C[]; center: UnitPoint; radius: number };

type ColorOf<C> = (c: IconColor) => C;

/** Approximation of Icon Composer's system backgrounds (question 3); legacy: white / 0.07843. */
const SYSTEM: Record<Appearance, [IconColor, IconColor]> = {
  light: [rgb(1, 1, 1), rgb(0.898, 0.898, 0.918)],
  dark: [rgb(0.227, 0.227, 0.235), rgb(0.07843, 0.07843, 0.07843)],
  // schema: "grey in monochrome" – values approximated (prompt 077 E2)
  tinted: [rgb(0.3, 0.3, 0.3), rgb(0.16, 0.16, 0.16)],
};
const TOP: UnitPoint = { x: 0.5, y: 0 };
const BOTTOM: UnitPoint = { x: 0.5, y: 1 };
const CENTER: UnitPoint = { x: 0.5, y: 0.5 };
/** Default radius of radial gradients (legacy `endRadius: 0.75`). */
const RADIAL_RADIUS = 0.75;

function rgb(r: number, g: number, b: number): IconColor {
  return { space: 'srgb', r, g, b, a: 1 };
}

function system<C>(appearance: Appearance, color: ColorOf<C>): FillPreview<C> {
  const [a, b] = SYSTEM[appearance];
  return { kind: 'linear', stops: [color(a), color(b)], start: TOP, stop: BOTTOM };
}

function unitPoint<T extends UnitPoint | null>(v: unknown, fallback: T): UnitPoint | T {
  if (typeof v !== 'object' || v === null) return fallback;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : fallback;
}

/** Colours of a gradient list; `null` if there are none that parse. */
function colorList<C>(v: unknown, color: ColorOf<C>): C[] | null {
  const list = (Array.isArray(v) ? v : [v]).map(parseIconColor).filter((c) => c !== null);
  if (list.length === 0) return null;
  const out = list.map(color);
  return out.length === 1 ? [out[0], out[0]] : out;
}

/** One fill value (string or object, Apple format) → preview; `null` = not understood. */
export function previewOf(fill: unknown, appearance: Appearance): FillPreview | null;
export function previewOf<C>(
  fill: unknown,
  appearance: Appearance,
  color: ColorOf<C>,
): FillPreview<C> | null;
export function previewOf(
  fill: unknown,
  appearance: Appearance,
  color: ColorOf<unknown> = cssColor,
): FillPreview<unknown> | null {
  if (fill === 'automatic') return system(appearance, color);
  if (fill === 'system-light') return system('light', color);
  if (fill === 'system-dark') return system('dark', color);
  if (fill === 'none') return { kind: 'none' };
  if (typeof fill !== 'object' || fill === null || Array.isArray(fill)) return null;
  const f = fill as Record<string, unknown>;
  const orientation = (f['orientation'] ?? {}) as { start?: unknown; stop?: unknown };
  if ('solid' in f) {
    const c = parseIconColor(f['solid']);
    return c ? { kind: 'solid', color: color(c) } : null;
  }
  if ('automatic-gradient' in f) {
    const c = parseIconColor(f['automatic-gradient']);
    if (!c) return null;
    const stops = [color(shift(c, 0.16)), color(shift(c, -0.14))];
    return { kind: 'linear', stops, start: TOP, stop: BOTTOM };
  }
  if ('linear-gradient' in f) {
    const stops = colorList(f['linear-gradient'], color);
    if (!stops) return null;
    const start = unitPoint(orientation.start, TOP);
    const stop = unitPoint(orientation.stop, BOTTOM);
    return { kind: 'linear', stops, start, stop };
  }
  if ('radial-gradient' in f) {
    const stops = colorList(f['radial-gradient'], color);
    if (!stops) return null;
    const center = unitPoint(orientation.start, CENTER);
    const edge = unitPoint(orientation.stop, null);
    const radius = edge
      ? Math.hypot(edge.x - center.x, edge.y - center.y) || RADIAL_RADIUS
      : RADIAL_RADIUS;
    return { kind: 'radial', stops, center, radius };
  }
  return null;
}

/**
 * The background of the document for `appearance` (pure): `fill-specializations` before `fill`,
 * nothing at all = `automatic`; not understood → `automatic` with `known: false` (the file is
 * never changed by the preview).
 */
export function fillPreview(
  icon: IconJson,
  appearance: Appearance,
): { preview: FillPreview; known: boolean };
export function fillPreview<C>(
  icon: IconJson,
  appearance: Appearance,
  color: ColorOf<C>,
): { preview: FillPreview<C>; known: boolean };
export function fillPreview(
  icon: IconJson,
  appearance: Appearance,
  color: ColorOf<unknown> = cssColor,
): { preview: FillPreview<unknown>; known: boolean } {
  const fill = specialized(icon['fill-specializations'], appearance, icon.fill ?? 'automatic');
  const preview = previewOf(fill, appearance, color);
  return preview ? { preview, known: true } : { preview: system(appearance, color), known: false };
}
