import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { prefixIds } from './export-svg';

/**
 * `favicon.svg` (prompt 079 E6): light and dark export SVG of the document in one file, switched by
 * `@media (prefers-color-scheme: dark)` inside the SVG (web.dev, "Building an adaptive favicon").
 * Browsers evaluate the media query of an SVG favicon against the system / page colour scheme.
 * Ids of both halves get their own prefix. Identical halves → the light SVG alone.
 */

/** The classes of both halves (the Playwright test and the Rust fixture use them). */
export const SCHEME_CLASS = { light: 'ai-light', dark: 'ai-dark' } as const;

export const SCHEME_STYLE =
  `.${SCHEME_CLASS.dark}{display:none}` +
  `@media (prefers-color-scheme: dark){.${SCHEME_CLASS.light}{display:none}` +
  `.${SCHEME_CLASS.dark}{display:inline}}`;

export function colorSchemeSvg(light: string, dark: string): string {
  if (light === dark) return light;
  const d = document.implementation.createDocument(SVG_NS, 'svg', null);
  const root = d.documentElement;
  root.setAttribute('width', String(CANVAS_SIZE));
  root.setAttribute('height', String(CANVAS_SIZE));
  root.setAttribute('viewBox', `0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`);
  const style = d.createElementNS(SVG_NS, 'style');
  style.textContent = SCHEME_STYLE;
  root.append(style);
  for (const [scheme, text] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    const src = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    prefixIds(src, `${scheme}-`);
    const g = d.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', SCHEME_CLASS[scheme]);
    for (const child of Array.from(src.childNodes)) g.append(d.importNode(child, true));
    root.append(g);
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(d) + '\n'
  );
}
