import { readAttr } from '../document/commands/node-commands';
import { styleValue } from '../document/svg/style-props';
import { isCssProperty, PropertyDef } from './property-spec';

/**
 * Reading property values (design 009 E2): the element's own value – `style` property before
 * the attribute, because it wins in the browser –, else the computed (inherited) value of a CSS
 * property, else the spec default. Reads the DOM, changes nothing.
 */

export type ValueSource = 'attribute' | 'style' | 'computed' | 'default' | 'none';

export interface PropertyValue {
  value: string | null;
  source: ValueSource;
}

const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** The attribute that holds `name`: `href` may still be written as `xlink:href`. */
export function attrNameOf(el: Element, name: string): string {
  if (name === 'href' && !el.hasAttribute('href') && el.hasAttributeNS(XLINK_NS, 'href')) {
    return 'xlink:href';
  }
  return name;
}

/** The text content (`text` property) and whether it can be edited (no child elements). */
export function readText(el: Element): { text: string; editable: boolean } {
  return { text: el.textContent ?? '', editable: el.children.length === 0 };
}

/** What the element itself declares for `name` (`style` first, then the attribute). */
export function ownValue(el: Element, name: string): { value: string; source: ValueSource } | null {
  if (name === 'text') return { value: readText(el).text, source: 'attribute' };
  if (isCssProperty(name)) {
    const s = styleValue(el, name);
    if (s !== null) return { value: s, source: 'style' };
  }
  const a = readAttr(el, attrNameOf(el, name));
  return a === null ? null : { value: a, source: 'attribute' };
}

/** The computed value of a CSS property (the browser resolves inheritance); `null` without one. */
export function computedValue(el: Element, name: string): string | null {
  if (!isCssProperty(name) || !el.isConnected) return null;
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  try {
    const v = view.getComputedStyle(el).getPropertyValue(name).trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function readProperty(el: Element, def: PropertyDef): PropertyValue {
  const own = ownValue(el, def.name);
  if (own) return own;
  const c = computedValue(el, def.name);
  if (c !== null) return { value: c, source: 'computed' };
  if (def.default !== undefined) return { value: def.default, source: 'default' };
  return { value: null, source: 'none' };
}

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?`;
const LENGTH = new RegExp(String.raw`^\s*(${NUM})\s*(px|%|em|ex|pt|pc|cm|mm|in|rem)?\s*$`);
const NUMBER = new RegExp(String.raw`^\s*(${NUM})\s*$`);

/** `12.5` / `50%` → number + unit; `null` if it is not one length. */
export function parseLength(v: string | null | undefined): { n: number; unit: string } | null {
  const m = LENGTH.exec(v ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? { n, unit: m[2] ?? '' } : null;
}

/** A plain number (no unit); `null` otherwise. */
export function parseNumber(v: string | null | undefined): number | null {
  const m = NUMBER.exec(v ?? '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** `value` is acceptable for `def` (numbers must be numbers; the rest is any text). */
export function validValue(def: PropertyDef, value: string): boolean {
  if (def.type === 'number') return parseNumber(value) !== null;
  if (def.type === 'length') return parseLength(value) !== null;
  return value.length <= 16 << 20;
}
