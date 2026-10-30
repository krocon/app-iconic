import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';

/**
 * The tinted appearance as an approximation (prompt 077 E2, E8): luminance of the composition ×
 * a tint. The tint is a view / export setting, never part of the document. Luminance with the
 * Rec. 709 weights on sRGB values (`color-interpolation-filters="sRGB"`, the same in the browser
 * and in resvg). Pure – also the basis of later exports (078 appiconset, 079 Android monochrome).
 */

/** Rec. 709 weights of R, G, B. */
export const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/** Default tint: white = the luminance itself (grey). */
export const DEFAULT_TINT = '#ffffff';

/** `#rrggbb` (lower case; `#rgb` is expanded) or `null`. */
export function parseTint(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

/** The channels of a tint, 0…1 (an invalid tint counts as the default). */
export function tintChannels(tint: string): [number, number, number] {
  const hex = parseTint(tint) ?? DEFAULT_TINT;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const fmt = (v: number) => String(Math.round(v * 100000) / 100000);

/**
 * The `feColorMatrix` values (20 numbers, row by row): every output channel = tint channel ×
 * luminance, alpha unchanged.
 */
export function tintedMatrix(tint: string): string {
  const row = (t: number) => [...LUMA.map((w) => fmt(w * t)), '0', '0'].join(' ');
  return [...tintChannels(tint).map(row), '0 0 0 1 0'].join(' ');
}

/**
 * The `<filter>` of the tinted approximation in canvas units (the export: over background and
 * groups; the canvas: over the artboard box via CSS, where the box is the object bounding box).
 */
export function tintFilter(d: Document, id: string, tint: string, onBox = false): Element {
  const filter = d.createElementNS(SVG_NS, 'filter');
  const attrs: Record<string, string> = onBox
    ? { id, x: '0', y: '0', width: '1', height: '1' }
    : {
        id,
        filterUnits: 'userSpaceOnUse',
        x: '0',
        y: '0',
        width: String(CANVAS_SIZE),
        height: String(CANVAS_SIZE),
      };
  for (const [k, v] of Object.entries(attrs)) filter.setAttribute(k, v);
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const m = d.createElementNS(SVG_NS, 'feColorMatrix');
  m.setAttribute('type', 'matrix');
  m.setAttribute('values', tintedMatrix(tint));
  filter.append(m);
  return filter;
}
