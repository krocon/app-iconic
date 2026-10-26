import { IconJson } from '../../core/icon-file/icon-file.models';
import { Appearance, specialized } from './appearance';
import { cssColor, IconColor, parseIconColor, shift } from './icon-color';

/** A point in unit coordinates of the artboard (0,0 top left … 1,1 bottom right). */
export interface UnitPoint {
  x: number;
  y: number;
}

/** What the canvas paints as background (design 004 E7). CSS colours. */
export type FillPreview =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; stops: string[]; start: UnitPoint; stop: UnitPoint }
  | { kind: 'radial'; stops: string[]; center: UnitPoint; radius: number };

/** Approximation of Icon Composer's system backgrounds (question 3); legacy: white / 0.07843. */
const SYSTEM: Record<Appearance, [IconColor, IconColor]> = {
  light: [rgb(1, 1, 1), rgb(0.898, 0.898, 0.918)],
  dark: [rgb(0.227, 0.227, 0.235), rgb(0.07843, 0.07843, 0.07843)],
};
const TOP: UnitPoint = { x: 0.5, y: 0 };
const BOTTOM: UnitPoint = { x: 0.5, y: 1 };
const CENTER: UnitPoint = { x: 0.5, y: 0.5 };
/** Default radius of radial gradients (legacy `endRadius: 0.75`). */
const RADIAL_RADIUS = 0.75;

function rgb(r: number, g: number, b: number): IconColor {
  return { space: 'srgb', r, g, b, a: 1 };
}

function system(appearance: Appearance): FillPreview {
  const [a, b] = SYSTEM[appearance];
  return { kind: 'linear', stops: [cssColor(a), cssColor(b)], start: TOP, stop: BOTTOM };
}

function unitPoint<T extends UnitPoint | null>(v: unknown, fallback: T): UnitPoint | T {
  if (typeof v !== 'object' || v === null) return fallback;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : fallback;
}

/** Colours of a gradient list; `null` if there are none that parse. */
function colorList(v: unknown): string[] | null {
  const list = (Array.isArray(v) ? v : [v]).map(parseIconColor).filter((c) => c !== null);
  if (list.length === 0) return null;
  const css = list.map(cssColor);
  return css.length === 1 ? [css[0], css[0]] : css;
}

/** One fill value (string or object, Apple format) → preview; `null` = not understood. */
export function previewOf(fill: unknown, appearance: Appearance): FillPreview | null {
  if (fill === 'automatic') return system(appearance);
  if (fill === 'system-light') return system('light');
  if (fill === 'system-dark') return system('dark');
  if (fill === 'none') return { kind: 'none' };
  if (typeof fill !== 'object' || fill === null || Array.isArray(fill)) return null;
  const f = fill as Record<string, unknown>;
  const orientation = (f['orientation'] ?? {}) as { start?: unknown; stop?: unknown };
  if ('solid' in f) {
    const c = parseIconColor(f['solid']);
    return c ? { kind: 'solid', color: cssColor(c) } : null;
  }
  if ('automatic-gradient' in f) {
    const c = parseIconColor(f['automatic-gradient']);
    if (!c) return null;
    const stops = [cssColor(shift(c, 0.16)), cssColor(shift(c, -0.14))];
    return { kind: 'linear', stops, start: TOP, stop: BOTTOM };
  }
  if ('linear-gradient' in f) {
    const stops = colorList(f['linear-gradient']);
    if (!stops) return null;
    const start = unitPoint(orientation.start, TOP);
    const stop = unitPoint(orientation.stop, BOTTOM);
    return { kind: 'linear', stops, start, stop };
  }
  if ('radial-gradient' in f) {
    const stops = colorList(f['radial-gradient']);
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
): { preview: FillPreview; known: boolean } {
  const fill = specialized(icon['fill-specializations'], appearance, icon.fill ?? 'automatic');
  const preview = previewOf(fill, appearance);
  return preview ? { preview, known: true } : { preview: system(appearance), known: false };
}
