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
