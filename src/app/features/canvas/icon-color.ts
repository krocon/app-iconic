/**
 * Colours of `icon.json` (legacy §2: `extended-srgb:r,g,b,a` and the prefixes `srgb`,
 * `display-p3`, `gray`; design 004 E7) → CSS Color 4. Pure. Extended values (< 0 or > 1) are kept –
 * `color(srgb …)` allows them.
 */
export type ColorSpace = 'srgb' | 'display-p3';

export interface IconColor {
  space: ColorSpace;
  r: number;
  g: number;
  b: number;
  a: number;
}

const PREFIX: Record<string, { space: ColorSpace; gray: boolean }> = {
  srgb: { space: 'srgb', gray: false },
  'extended-srgb': { space: 'srgb', gray: false },
  'display-p3': { space: 'display-p3', gray: false },
  'extended-display-p3': { space: 'display-p3', gray: false },
  gray: { space: 'srgb', gray: true },
  'extended-gray': { space: 'srgb', gray: true },
};

/** `null` for anything that is not `<prefix>:<numbers>` with the right count (alpha optional). */
export function parseIconColor(value: unknown): IconColor | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i.exec(value);
  const kind = m ? PREFIX[m[1].toLowerCase()] : undefined;
  if (!m || !kind) return null;
  const nums = m[2].split(',').map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (kind.gray) {
    if (nums.length < 1 || nums.length > 2) return null;
    const [w, a = 1] = nums;
    return { space: kind.space, r: w, g: w, b: w, a };
  }
  if (nums.length < 3 || nums.length > 4) return null;
  const [r, g, b, a = 1] = nums;
  return { space: kind.space, r, g, b, a };
}

const fmt = (v: number) => String(Math.round(v * 100000) / 100000);

/** `color(srgb 0 0.53333 1 / 1)` – alpha clamped to 0…1. */
export function cssColor(c: IconColor): string {
  const a = Math.min(Math.max(c.a, 0), 1);
  return `color(${c.space} ${fmt(c.r)} ${fmt(c.g)} ${fmt(c.b)} / ${fmt(a)})`;
}

/** Adds `amount` to every channel, limited to 0…1 (legacy auto gradient: +16 % / −14 %). */
export function shift(c: IconColor, amount: number): IconColor {
  const f = (v: number) => Math.min(Math.max(v + amount, 0), 1);
  return { ...c, r: f(c.r), g: f(c.g), b: f(c.b) };
}

/** A colour as SVG 1.1 understands it (resvg): `#rrggbb` + opacity (design 012 E3). */
export interface SvgColor {
  hex: string;
  opacity: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
/** Linear Display P3 → linear sRGB (both D65). */
const P3_TO_SRGB = [
  [1.2249401762805598, -0.22494017628055996, 0],
  [-0.042056954709688163, 1.0420569547096881, 0],
  [-0.019637554590334432, -0.07863604555063189, 1.0982736001409663],
];
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
// rounded to 6 places first: a P3 grey must stay exactly that grey (no x.4999 → down)
const hex2 = (v: number) =>
  Math.round(Math.round(clamp01(v) * 255e6) / 1e6)
    .toString(16)
    .padStart(2, '0');

/**
 * sRGB hex + opacity for the export (resvg knows no `color(display-p3 …)`): Display P3 is
 * converted (linear matrix, sRGB transfer curve), every channel clamped to 0…1 (8 bit). Pure.
 */
export function svgColor(c: IconColor): SvgColor {
  let rgb = [c.r, c.g, c.b];
  if (c.space === 'display-p3') {
    const lin = rgb.map((v) => toLinear(clamp01(v)));
    rgb = P3_TO_SRGB.map((row) =>
      toGamma(clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])),
    );
  }
  return { hex: `#${rgb.map(hex2).join('')}`, opacity: Math.round(clamp01(c.a) * 1000) / 1000 };
}
