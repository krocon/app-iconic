import { Rect } from '../../shared/geometry/dom-geometry';
import { translation } from '../../shared/geometry/matrix';
import { prependAffine } from '../../shared/geometry/transform-text';
import { Point } from '../../shared/geometry/view-transform';
import { MAX_MARKUP } from '../document/commands/registry';
import { isDefinitionTag } from '../document/model/reorder-rules';
import { SVG_NS } from '../document/svg/node-ids';
import { sanitizeSvg } from '../document/svg/sanitize-svg';
import { renameCollidingIds } from '../document/svg/svg-references';
import { parseClipboard } from '../hierarchy/paste';

/**
 * "Add › SVG Snippet…" (design 008 E9; legacy `AppModel.addSVGSnippet`, Marc Kronberg): markup →
 * the elements to append. A whole `<svg>` is unpacked (its children), a fragment taken as it is;
 * everything is cleaned BEFORE it may reach the window (scripts, handlers, external refs), `defs`
 * come along, ids are made unique against the target asset. Centring measures with the browser.
 */

export type SnippetError = 'empty' | 'invalid' | 'tooLarge';

/** Notes about a snippet, not elements to insert. */
const DROPPED = new Set(['title', 'desc', 'metadata']);

/** The cleaned top-level elements of `text`, or why there are none. Inert (XML document). */
export function snippetElements(text: string): { elements: Element[] } | { error: SnippetError } {
  if (!text.trim()) return { error: 'empty' };
  if (text.length > MAX_MARKUP) return { error: 'tooLarge' };
  const parsed = parseClipboard(text);
  if (!parsed) return { error: 'invalid' };
  const root = parsed.elements[0]?.parentElement;
  if (!root) return { error: 'empty' };
  sanitizeSvg(root);
  const elements = Array.from(root.children).filter((e) => !DROPPED.has(e.localName));
  if (!elements.some((e) => !isDefinitionTag(e))) return { error: 'empty' };
  return { elements };
}

/** Measures the union bounds of elements in their own space; `null` without layout. */
export type SnippetMeasure = (elements: readonly Element[]) => Rect | null;

/**
 * The browser measures (design 008 E9): CLEANED copies go into an invisible `<svg>` for one
 * `getBBox()` of a wrapping `<g>` (own transforms included), then away again.
 */
export const measureInDom: SnippetMeasure = (elements) => {
  const body = globalThis.document?.body;
  if (!body) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute(
    'style',
    'position:absolute;left:-99999px;top:0;width:1px;height:1px;visibility:hidden',
  );
  const g = document.createElementNS(SVG_NS, 'g');
  for (const el of elements) g.appendChild(document.importNode(el, true));
  svg.appendChild(g);
  body.appendChild(svg);
  try {
    if (typeof g.getBBox !== 'function') return null;
    const b = g.getBBox();
    return b.width > 0 || b.height > 0
      ? { x: b.x, y: b.y, width: b.width, height: b.height }
      : null;
  } catch {
    return null;
  } finally {
    svg.remove();
  }
};

/**
 * Markup per element, centred on `center` (the target's user space): the shift goes in FRONT of
 * every painting element's `transform` (design 007 E11); definitions stay. Ids are made unique
 * against `taken` first.
 */
export function snippetMarkups(
  elements: readonly Element[],
  taken: Set<string>,
  center: Point,
  measure: SnippetMeasure = measureInDom,
): string[] {
  renameCollidingIds(elements, taken);
  const painting = elements.filter((e) => !isDefinitionTag(e));
  const box = measure(elements);
  if (box) {
    const dx = center.x - (box.x + box.width / 2);
    const dy = center.y - (box.y + box.height / 2);
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
      for (const el of painting) {
        el.setAttribute(
          'transform',
          prependAffine(el.getAttribute('transform'), translation(dx, dy)),
        );
      }
    }
  }
  const ser = new XMLSerializer();
  return elements.map((e) => ser.serializeToString(e));
}
