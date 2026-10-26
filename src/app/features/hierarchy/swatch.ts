import { FillPreview } from '../canvas/fill-preview';
import { elementsOf } from '../document/svg/node-ids';

/**
 * Colour swatches of a tree row (design 006 E3, legacy `NodeColorSwatch`): what the element
 * itself declares for `fill` / `stroke` (attribute or `style`, not inherited). Pure – reads the DOM.
 */
export type Swatch =
  | { kind: 'color'; css: string }
  | { kind: 'none' }
  | { kind: 'gradient'; css: string }
  | { kind: 'pattern' }
  | { kind: 'inherit' };

/** How many `href`s of a gradient are followed to find its stops. */
const MAX_HREF = 8;
/** Only plain colour syntax reaches a style binding (no `url(`, no `;`). */
const SAFE_COLOR = /^[#\w\s(),.%/+-]{1,80}$/;
const URL = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/;

/** The declared value of a presentation property: `style` first, then the attribute. */
export function declared(el: Element, prop: string): string | null {
  const style = (el as Partial<ElementCSSInlineStyle>).style;
  const fromStyle = style?.getPropertyValue(prop)?.trim();
  if (fromStyle) return fromStyle;
  const attr = el.getAttribute(prop)?.trim();
  return attr ? attr : null;
}

export function safeColor(v: string | null | undefined): string | null {
  if (!v || !SAFE_COLOR.test(v) || /url|expression/i.test(v)) return null;
  return v;
}

function byId(root: Element, id: string): Element | null {
  return elementsOf(root).find((e) => e.getAttribute('id') === id) ?? null;
}

/** `<stop>`s of a gradient, following `href` to the gradient that has them. */
function stopsOf(root: Element, gradient: Element): Element[] {
  let g: Element | null = gradient;
  for (let i = 0; g && i <= MAX_HREF; i++) {
    const stops = Array.from(g.children).filter((c) => c.localName === 'stop');
    if (stops.length) return stops;
    const href: string | null =
      g.getAttribute('href') ?? g.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    g = href?.startsWith('#') ? byId(root, href.slice(1)) : null;
  }
  return [];
}

function offsetOf(stop: Element): string {
  const raw = stop.getAttribute('offset')?.trim() ?? '0';
  const n = raw.endsWith('%') ? parseFloat(raw) : parseFloat(raw) * 100;
  return `${Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0}%`;
}

function stopColor(stop: Element): string {
  const c = safeColor(declared(stop, 'stop-color')) ?? 'black';
  const o = parseFloat(declared(stop, 'stop-opacity') ?? '1');
  if (!Number.isFinite(o) || o >= 1) return c;
  return `color-mix(in srgb, ${c} ${Math.max(0, o) * 100}%, transparent)`;
}

/** The swatch of `prop` (`fill` / `stroke`) of `el`; `null` = the element declares nothing. */
export function swatchOf(el: Element, prop: 'fill' | 'stroke', root: Element): Swatch | null {
  const v = declared(el, prop);
  if (!v) return null;
  if (v === 'none' || v === 'transparent') return { kind: 'none' };
  if (v === 'currentColor' || v === 'inherit' || v === 'context-fill' || v === 'context-stroke') {
    return { kind: 'inherit' };
  }
  const m = URL.exec(v);
  if (m) {
    const target = byId(root, m[1]);
    if (target?.localName === 'linearGradient' || target?.localName === 'radialGradient') {
      const stops = stopsOf(root, target).map((s) => `${stopColor(s)} ${offsetOf(s)}`);
      if (stops.length === 1) return { kind: 'color', css: stops[0].replace(/ [\d.]+%$/, '') };
      if (stops.length > 1)
        return { kind: 'gradient', css: `linear-gradient(90deg, ${stops.join(', ')})` };
    }
    return { kind: 'pattern' };
  }
  const css = safeColor(v);
  return css ? { kind: 'color', css } : { kind: 'inherit' };
}

/** The swatch of the icon's background fill (root row; design 004 E7 preview). */
export function fillSwatch(f: FillPreview): Swatch {
  switch (f.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      return { kind: 'color', css: f.color };
    default:
      return { kind: 'gradient', css: `linear-gradient(180deg, ${f.stops.join(', ')})` };
  }
}
