/**
 * Stable node ids (design 003 E2) and serialisation of assets. Every element of an asset carries
 * `data-ai-id`; `serializeAsset` writes a copy without any `data-ai-*` attribute.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const ID_ATTR = 'data-ai-id';
const INTERNAL_PREFIX = 'data-ai-';

/** One parsed SVG asset: its own XML document plus what the serialiser does not keep. */
export interface SvgText {
  doc: XMLDocument;
  /** `<?xml …?>` declaration and the white space after it (not part of the DOM). */
  head: string;
  /** White space after the root element (usually the final newline). */
  tail: string;
}

/** Parses SVG markup; `null` if it is no well-formed SVG (`<parsererror>` or another root). */
export function parseSvg(text: string): SvgText | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (
    !root ||
    root.namespaceURI !== SVG_NS ||
    root.localName !== 'svg' ||
    doc.getElementsByTagNameNS('*', 'parsererror').length > 0
  ) {
    return null;
  }
  const head = /^\uFEFF?\s*<\?xml[\s\S]*?\?>\s*/.exec(text)?.[0].replace(/^\uFEFF/, '') ?? '';
  const tail = /\s*$/.exec(text)?.[0] ?? '';
  return { doc, head, tail };
}

/** All elements of a subtree, `root` first, in document order. */
export function elementsOf(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))];
}

/** Gives every element of `root` a fresh id from `next` (existing ids are replaced). */
export function assignIds(root: Element, next: () => string): void {
  for (const el of elementsOf(root)) el.setAttribute(ID_ATTR, next());
}

/** Removes every `data-ai-*` attribute from the subtree (in place). */
export function stripInternal(root: Element): void {
  for (const el of elementsOf(root)) {
    for (const name of el.getAttributeNames()) {
      if (name.startsWith(INTERNAL_PREFIX)) el.removeAttribute(name);
    }
  }
}

/** Markup of an element without internal attributes (the element itself is not changed). */
export function serializeElement(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  stripInternal(copy);
  return new XMLSerializer().serializeToString(copy);
}

/** The asset as file text: declaration + document without internal attributes + tail. */
export function serializeAsset(svg: SvgText): string {
  const copy = svg.doc.cloneNode(true) as XMLDocument;
  if (copy.documentElement) stripInternal(copy.documentElement);
  return svg.head + new XMLSerializer().serializeToString(copy) + svg.tail;
}

/** Parses a fragment of SVG markup (one element) in the SVG namespace; `null` if invalid. */
export function parseFragment(markup: string): Element | null {
  const wrapped = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`;
  const parsed = parseSvg(wrapped);
  const children = parsed ? Array.from(parsed.doc.documentElement.children) : [];
  return children.length === 1 ? children[0] : null;
}
