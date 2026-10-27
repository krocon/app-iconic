import { SVG_NS } from './node-ids';

/**
 * Properties in an element's `style` attribute (design 006 E4, 009 E3) – the browser parses the
 * declarations (CSSOM of a scratch element), no own CSS parser.
 */

/** The value of `prop` in the element's own `style` (not inherited), `null` if none. */
export function styleValue(el: Element, prop: string): string | null {
  const style = (el as Partial<ElementCSSInlineStyle>).style;
  const v = style?.getPropertyValue(prop)?.trim();
  return v ? v : null;
}

/** The element's `style` without the declarations of `props`; `null` when nothing is left. */
export function styleWithout(el: Element, ...props: string[]): string | null {
  const tmp = el.ownerDocument.createElementNS(SVG_NS, 'g') as SVGGElement;
  tmp.setAttribute('style', el.getAttribute('style') ?? '');
  for (const p of props) tmp.style.removeProperty(p);
  const s = tmp.getAttribute('style')?.trim();
  return s ? s : null;
}
