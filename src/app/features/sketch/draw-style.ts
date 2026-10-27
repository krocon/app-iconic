import { DrawStyle, StyleKind } from '../../core/settings/settings.models';
import { styleValueOk } from '../../core/settings/settings-rules';
import { parsePath } from '../../shared/geometry/path-data';
import { styleValue } from '../document/svg/style-props';

/**
 * The remembered paint of shapes (design 019 E12): which kind a shape is, which properties count
 * and how they are read from and written to an element. Pure (reads the element only).
 */

/** Settings key → presentation attribute. */
export const STYLE_PROPS: readonly [keyof DrawStyle, string][] = [
  ['fill', 'fill'],
  ['fillOpacity', 'fill-opacity'],
  ['stroke', 'stroke'],
  ['strokeWidth', 'stroke-width'],
  ['strokeOpacity', 'stroke-opacity'],
  ['strokeLinecap', 'stroke-linecap'],
  ['strokeLinejoin', 'stroke-linejoin'],
  ['strokeDasharray', 'stroke-dasharray'],
  ['opacity', 'opacity'],
];

/** The attribute names of the remembered properties. */
export const STYLE_ATTRS: ReadonlySet<string> = new Set(STYLE_PROPS.map(([, a]) => a));

/** A path of exactly one move and one arc – what the arc tools draw. */
export function isArcPath(d: string | null): boolean {
  const segs = d ? parsePath(d) : null;
  return !!segs && segs.length === 2 && segs[0].cmd === 'M' && segs[1].cmd === 'A';
}

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/** The kind of shape whose style `el` sets; `null` for text, images, groups … */
export function styleKindOf(el: Element): StyleKind | null {
  const tag = el.localName;
  if (SHAPES.has(tag)) return tag as StyleKind;
  if (tag === 'path') return isArcPath(el.getAttribute('d')) ? 'arc' : 'path';
  return null;
}

/** The paint of `el` as written: its own `style` before the attribute, `''` = not set. */
export function readStyle(el: Element): DrawStyle {
  const out = {} as DrawStyle;
  for (const [key, attr] of STYLE_PROPS) {
    const v = (styleValue(el, attr) ?? el.getAttribute(attr) ?? '').trim();
    out[key] = styleValueOk(v) ? v : '';
  }
  return out;
}

/** The attributes a new shape gets from a remembered style (empty values are left out). */
export function styleAttrs(style: DrawStyle): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, attr] of STYLE_PROPS) {
    const v = style[key];
    if (v && styleValueOk(v)) out[attr] = v;
  }
  return out;
}

export function sameStyle(a: DrawStyle, b: DrawStyle): boolean {
  return STYLE_PROPS.every(([k]) => a[k] === b[k]);
}
