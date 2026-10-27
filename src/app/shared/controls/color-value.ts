/**
 * Colour values of the colour editor (design 009 E10, legacy `SVGColorValue`): hex `#RGB` /
 * `#RRGGBB` / `#RRGGBBAA` (CSS order, as the template's parser and every browser read it), the
 * keywords `none` / `inherit` / `currentColor`, references `url(#gradient)`. Other CSS colours
 * (`red`, `rgb(…)`) stay text. Pure.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0…1 */
  a: number;
}

export type ColorKind = 'none' | 'keyword' | 'url' | 'hex' | 'other';

/** Keywords offered by the menu (design 009 E10). */
export const COLOR_KEYWORDS: readonly string[] = ['none', 'inherit', 'currentColor'];

const KEYWORDS = new Set(['inherit', 'currentcolor', 'context-fill', 'context-stroke']);
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const URL = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/i;

export function colorKind(v: string | null | undefined): ColorKind {
  const s = (v ?? '').trim();
  if (s === 'none' || s === 'transparent') return 'none';
  if (KEYWORDS.has(s.toLowerCase())) return 'keyword';
  if (URL.test(s)) return 'url';
  if (s.startsWith('#') && HEX.test(s)) return 'hex';
  return 'other';
}

/** The id of `url(#id)`, else `null`. */
export function urlId(v: string | null | undefined): string | null {
  return URL.exec((v ?? '').trim())?.[1] ?? null;
}

/** `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` (the `#` optional) → channels; else `null`. */
export function parseHex(s: string): Rgba | null {
  const m = HEX.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** `#RRGGBB`, with alpha `#RRGGBBAA`. */
export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 1 ? base : base + hex2(c.a * 255);
}

/** What the user typed into the hex field → `#RRGGBB(AA)`, `null` if it is no hex colour. */
export function normalizeHex(input: string): string | null {
  const c = parseHex(input);
  return c ? toHex(c) : null;
}

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?`;
const RGB = new RegExp(
  String.raw`^rgba?\(\s*(${NUM})(%?)\s*[,\s]\s*(${NUM})(%?)\s*[,\s]\s*(${NUM})(%?)\s*(?:[,/]\s*(${NUM})(%?)\s*)?\)$`,
  'i',
);

/** `rgb(1, 2, 3)`, `rgba(1,2,3,.5)`, `rgb(1 2 3 / 50%)` → channels. */
export function parseRgbFunction(s: string): Rgba | null {
  const m = RGB.exec(s.trim());
  if (!m) return null;
  const ch = (v: string, pct: string) => (pct ? (Number(v) * 255) / 100 : Number(v));
  const a = m[7] === undefined ? 1 : m[8] ? Number(m[7]) / 100 : Number(m[7]);
  return {
    r: ch(m[1], m[2]),
    g: ch(m[3], m[4]),
    b: ch(m[5], m[6]),
    a: Math.min(1, Math.max(0, a)),
  };
}

/** Channels of a hex or `rgb()` colour; `resolve` may ask the browser for any other CSS colour. */
export function toRgba(
  v: string | null | undefined,
  resolve?: (css: string) => string | null,
): Rgba | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (s.startsWith('#')) return parseHex(s);
  const rgb = parseRgbFunction(s);
  if (rgb) return rgb;
  if (colorKind(s) !== 'other' || !resolve) return null;
  const r = resolve(s);
  return r ? (r.startsWith('#') ? parseHex(r) : parseRgbFunction(r)) : null;
}

/** The value for `<input type="color">` (`#rrggbb`, no alpha); black if unknown. */
export function nativeValue(
  v: string | null | undefined,
  resolve?: (css: string) => string | null,
): string {
  const c = toRgba(v, resolve);
  return (c ? toHex({ ...c, a: 1 }) : '#000000').toLowerCase();
}

/** A colour picked natively (`#rrggbb`) keeps the alpha of the old hex value. */
export function withPicked(old: string | null | undefined, picked: string): string {
  const c = parseHex(picked);
  if (!c) return old ?? '';
  const before = (old ?? '').trim().startsWith('#') ? parseHex(old!) : null;
  return toHex({ ...c, a: before?.a ?? 1 });
}

/** The scratch canvas of `browserColor` (made once; `null` where there is none, e.g. jsdom). */
let scratch: CanvasRenderingContext2D | null | undefined;

/**
 * The browser's own colour parser (canvas `fillStyle` normalises every CSS colour to `#rrggbb` /
 * `rgba(…)`); `null` without a canvas (jsdom) or for an invalid colour.
 */
export function browserColor(css: string): string | null {
  try {
    if (scratch === undefined) scratch = document.createElement('canvas').getContext('2d');
    const ctx = scratch;
    if (!ctx) return null;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = css;
    const out = String(ctx.fillStyle);
    if (out === '#010203' && css.trim().toLowerCase() !== '#010203') return null;
    return out;
  } catch {
    scratch = null;
    return null;
  }
}
