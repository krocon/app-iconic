import { parseHex, Rgba, toHex } from '../../shared/controls/color-value';
import { cssColor, parseIconColor, shift } from '../canvas/icon-color';

/**
 * Colours of `icon.json` as text (design 010 E8, legacy §2): `<prefix>:<components>` with the
 * prefixes `srgb`, `extended-srgb`, `display-p3`, `extended-display-p3`, `gray`, `extended-gray`.
 * The inspector shows the channels as hex **in the colour space of the file** (no conversion) and
 * writes in the form it read: same prefix, same number of components, 5 decimals. Pure.
 */

export interface ColorText {
  prefix: string;
  gray: boolean;
  /** r, g, b (gray: w) and alpha when written. */
  values: number[];
}

const PREFIXES = new Set([
  'srgb',
  'extended-srgb',
  'display-p3',
  'extended-display-p3',
  'gray',
  'extended-gray',
]);

/** The most common form in Icon Composer files (design 010, belegt). */
export const DEFAULT_PREFIX = 'display-p3';
/** Palette colour of the legacy app (`0,0.53333,1,1`) in the default form. */
export const DEFAULT_COLOR = 'display-p3:0.00000,0.53333,1.00000,1.00000';

export function readColor(raw: unknown): ColorText | null {
  if (typeof raw !== 'string' || !parseIconColor(raw)) return null;
  const m = /^\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i.exec(raw)!;
  const prefix = m[1].toLowerCase();
  if (!PREFIXES.has(prefix)) return null;
  return {
    prefix,
    gray: prefix.endsWith('gray'),
    values: m[2].split(',').map((s) => Number(s.trim())),
  };
}

export const isIconColor = (raw: unknown): raw is string => readColor(raw) !== null;

const byte = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 255);

/** `#RRGGBB` (or `#RRGGBBAA` when not opaque) of the channels; `null` if not a colour. */
export function hexOf(raw: unknown): string | null {
  const c = readColor(raw);
  if (!c) return null;
  const [r, g, b, a] = c.gray ? [c.values[0], c.values[0], c.values[0], c.values[1]] : c.values;
  const rgba: Rgba = { r: byte(r), g: byte(g), b: byte(b), a: Math.min(Math.max(a ?? 1, 0), 1) };
  return toHex(rgba);
}

/** The colour space shown next to the hex value. */
export function spaceOf(raw: unknown): string {
  return readColor(raw)?.prefix ?? DEFAULT_PREFIX;
}

/** CSS of the colour (swatch); `null` if not a colour. */
export function cssOf(raw: unknown): string | null {
  const c = parseIconColor(raw);
  return c ? cssColor(c) : null;
}

const fmt = (v: number) => (Math.round(v * 100000) / 100000).toFixed(5);

function write(prefix: string, values: number[]): string {
  return `${prefix}:${values.map(fmt).join(',')}`;
}

/**
 * `raw` with the channels of `hex` (design 010 E8): prefix and component count of `raw` (a grey
 * that gets a hue becomes `srgb` / `extended-srgb`); the alpha of `raw` stays unless `hex` has
 * one. Without a readable `raw`: the default form. `null` if `hex` is not a hex colour.
 */
export function withHex(raw: unknown, hex: string): string | null {
  const h = parseHex(hex);
  if (!h) return null;
  const old = readColor(raw) ?? readColor(DEFAULT_COLOR)!;
  const hasAlphaIn = /^#?([0-9a-f]{4}|[0-9a-f]{8})$/i.test(hex.trim());
  const oldAlpha = old.gray ? old.values[1] : old.values[3];
  const a = hasAlphaIn ? h.a : (oldAlpha ?? 1);
  const writeAlpha = hasAlphaIn || oldAlpha !== undefined;
  const [r, g, b] = [h.r / 255, h.g / 255, h.b / 255];
  if (old.gray && h.r === h.g && h.g === h.b) {
    return write(old.prefix, writeAlpha ? [r, a] : [r]);
  }
  const prefix = old.gray ? old.prefix.replace('gray', 'srgb') : old.prefix;
  return write(prefix, writeAlpha ? [r, g, b, a] : [r, g, b]);
}

/** A colour `amount` lighter (+) / darker (−) in the same form (gradients made from one colour). */
export function shifted(raw: string, amount: number): string {
  const c = readColor(raw);
  const parsed = parseIconColor(raw);
  if (!c || !parsed) return raw;
  const s = shift(parsed, amount);
  if (c.gray) return write(c.prefix, c.values.length > 1 ? [s.r, c.values[1]] : [s.r]);
  return write(c.prefix, c.values.length > 3 ? [s.r, s.g, s.b, c.values[3]] : [s.r, s.g, s.b]);
}
