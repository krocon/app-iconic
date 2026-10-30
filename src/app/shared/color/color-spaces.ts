import { Rgba } from '../controls/color-value';

/**
 * Colour spaces of the colour popover (prompt 074 E1), pure: sRGB channels 0…255 ↔ HSL, HSB (HSV)
 * and OKLCH (Björn Ottosson's OKLab, CSS Color 4 reference matrices). Everything goes through
 * sRGB – what the document stores; out-of-gamut OKLCH values are clipped to sRGB.
 */

export interface Hsl {
  /** 0…360 */
  h: number;
  /** 0…100 */
  s: number;
  l: number;
}

export interface Hsb {
  h: number;
  s: number;
  b: number;
}

export interface Oklch {
  /** 0…1 */
  l: number;
  /** 0…~0.4 */
  c: number;
  /** 0…360 */
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hue = (h: number) => ((h % 360) + 360) % 360;

export function rgbToHsb({ r, g, b }: Rgba): Hsb {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  return { h: hue(h * 60), s: max ? (d / max) * 100 : 0, b: max * 100 };
}

export function hsbToRgb({ h, s, b }: Hsb, a = 1): Rgba {
  const S = clamp(s, 0, 100) / 100;
  const V = clamp(b, 0, 100) / 100;
  const f = (n: number) => {
    const k = (n + hue(h) / 60) % 6;
    return V - V * S * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255, a };
}

export function rgbToHsl(c: Rgba): Hsl {
  const { h, s: sv, b: v } = rgbToHsb(c);
  const V = v / 100;
  const L = V * (1 - sv / 200);
  const S = L === 0 || L === 1 ? 0 : (V - L) / Math.min(L, 1 - L);
  return { h, s: S * 100, l: L * 100 };
}

export function hslToRgb({ h, s, l }: Hsl, a = 1): Rgba {
  const L = clamp(l, 0, 100) / 100;
  const S = clamp(s, 0, 100) / 100;
  const V = L + S * Math.min(L, 1 - L);
  return hsbToRgb({ h, s: V ? 2 * (1 - L / V) * 100 : 0, b: V * 100 }, a);
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: Rgba): Oklch {
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, Bb);
  return { l: L, c: C, h: C < 1e-6 ? 0 : hue((Math.atan2(Bb, A) * 180) / Math.PI) };
}

export function oklchToRgb({ l: L, c: C, h }: Oklch, a = 1): Rgba {
  const rad = (hue(h) * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const ch = (v: number) => clamp(fromLinear(v), 0, 255);
  return { r: ch(R), g: ch(G), b: ch(Bl), a };
}

/** The input formats of the popover. */
export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'hsb' | 'oklch';

export const COLOR_FORMATS: readonly ColorFormat[] = ['hex', 'rgb', 'hsl', 'hsb', 'oklch'];

const r1 = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const alphaPart = (a: number) => (a < 1 ? ` / ${r1(a * 100)}%` : '');

/** `c` written in `format` (what the field of the popover shows). */
export function formatColor(c: Rgba, format: ColorFormat): string {
  switch (format) {
    case 'rgb':
      return `rgb(${r1(c.r)} ${r1(c.g)} ${r1(c.b)}${alphaPart(c.a)})`;
    case 'hsl': {
      const v = rgbToHsl(c);
      return `hsl(${r1(v.h)} ${r1(v.s)}% ${r1(v.l)}%${alphaPart(c.a)})`;
    }
    case 'hsb': {
      const v = rgbToHsb(c);
      return `hsb(${r1(v.h)} ${r1(v.s)}% ${r1(v.b)}%${alphaPart(c.a)})`;
    }
    case 'oklch': {
      const v = rgbToOklch(c);
      return `oklch(${r1(v.l * 100, 1)}% ${r1(v.c, 3)} ${r1(v.h, 1)}${alphaPart(c.a)})`;
    }
    default: {
      const h = (n: number) =>
        Math.round(clamp(n, 0, 255))
          .toString(16)
          .padStart(2, '0')
          .toUpperCase();
      return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a * 255) : ''}`;
    }
  }
}

const NUM = String.raw`([-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?)`;
const FN = new RegExp(
  String.raw`^(hsla?|hsb|hsv|oklch)\(\s*${NUM}(%|deg)?[\s,]+${NUM}(%)?[\s,]+${NUM}(%)?\s*(?:[,/]\s*${NUM}(%)?\s*)?\)$`,
  'i',
);

/** `hsl(…)`, `hsb(…)` / `hsv(…)`, `oklch(…)` → sRGB channels; `null` for anything else. */
export function parseColorFunction(text: string): Rgba | null {
  const m = FN.exec(text.trim());
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const [x, y, z] = [Number(m[2]), Number(m[4]), Number(m[6])];
  const a = m[8] === undefined ? 1 : clamp(m[9] ? Number(m[8]) / 100 : Number(m[8]), 0, 1);
  if (fn === 'oklch') {
    const l = m[3] === '%' ? x / 100 : x;
    const c = m[5] === '%' ? (y / 100) * 0.4 : y;
    return oklchToRgb({ l: clamp(l, 0, 1), c: Math.max(0, c), h: z }, a);
  }
  if (fn === 'hsb' || fn === 'hsv') return hsbToRgb({ h: x, s: y, b: z }, a);
  return hslToRgb({ h: x, s: y, l: z }, a);
}

/**
 * The value written into the document for `c` (prompt 074 E1): the format the value had stays –
 * `rgb()` / `hsl()` in the comma syntax every renderer reads (resvg too), everything else as
 * `#RRGGBB` or `#RRGGBBAA` (alpha in the colour, one attribute – resvg renders it, design E1).
 */
export function writeLike(previous: string | null | undefined, c: Rgba): string {
  const p = (previous ?? '').trim().toLowerCase();
  const a = r1(c.a, 3);
  if (p.startsWith('rgb')) {
    const ch = `${r1(c.r)}, ${r1(c.g)}, ${r1(c.b)}`;
    return c.a < 1 ? `rgba(${ch}, ${a})` : `rgb(${ch})`;
  }
  if (p.startsWith('hsl')) {
    const v = rgbToHsl(c);
    const ch = `${r1(v.h)}, ${r1(v.s)}%, ${r1(v.l)}%`;
    return c.a < 1 ? `hsla(${ch}, ${a})` : `hsl(${ch})`;
  }
  return formatColor(c, 'hex');
}

/** The format a value is shown in first: its own, else hex. */
export function formatOf(v: string | null | undefined): ColorFormat {
  const p = (v ?? '').trim().toLowerCase();
  if (p.startsWith('rgb')) return 'rgb';
  if (p.startsWith('hsl')) return 'hsl';
  if (p.startsWith('oklch')) return 'oklch';
  return 'hex';
}
