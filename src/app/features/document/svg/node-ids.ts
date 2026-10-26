/**
 * Stable node ids (design 003 E2) and serialisation of assets. Every element of an asset carries
 * `data-ai-id`; `serializeAsset` writes a copy without any `data-ai-*` attribute.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const ID_ATTR = 'data-ai-id';
const INTERNAL_PREFIX = 'data-ai-';

/**
 * One parsed SVG asset (design 003 E2, 004 E1): its `<svg>` root plus what the serialiser does not
 * keep. Right after parsing the root lives in the inert XML document `doc`; once it is cleaned,
 * {@link goLive} moves it into the window document (the canvas shows this very instance) and
 * `doc` keeps only the prolog (comments, doctype) with the root's position in `rootIndex`.
 */
export interface SvgText {
  /** The parsed file – after `goLive` without its root element. */
  doc: XMLDocument;
  /** The asset's `<svg>` element. */
  root: Element;
  /** Index of `root` among the child nodes of `doc` (where `serializeAsset` puts it back). */
  rootIndex: number;
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
  const rootIndex = Array.prototype.indexOf.call(doc.childNodes, root) as number;
  return { doc, root, rootIndex, head, tail };
}

/**
 * Moves the root of a parsed asset into the window document, so that the canvas can show the
 * same instance and the browser can measure it (design 004 E1). Only for CLEANED markup: an
 * element of an HTML document runs event handlers (`<image onerror>`) even when detached.
 */
export function goLive(svg: SvgText, into: Document = document): void {
  if (svg.root.ownerDocument === into) return;
  svg.rootIndex = Array.prototype.indexOf.call(svg.doc.childNodes, svg.root) as number;
  svg.root = into.adoptNode(svg.root);
}

/** A copy of the whole file as XML document (root put back at its place). */
function fileCopy(svg: SvgText, keepIds: boolean): XMLDocument {
  const copy = svg.doc.cloneNode(true) as XMLDocument;
  if (svg.root.ownerDocument !== svg.doc || svg.root.parentNode !== svg.doc) {
    const root = copy.importNode(svg.root, true);
    copy.insertBefore(root, copy.childNodes[svg.rootIndex] ?? null);
  }
  if (!keepIds && copy.documentElement) stripInternal(copy.documentElement);
  return copy;
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

/**
 * The asset as file text: declaration + document without internal attributes + tail.
 * `keepIds` keeps the `data-ai-*` attributes (tests: "identical after undo").
 */
export function serializeAsset(svg: SvgText, keepIds = false): string {
  return svg.head + new XMLSerializer().serializeToString(fileCopy(svg, keepIds)) + svg.tail;
}

/** Parses a fragment of SVG markup (one element) in the SVG namespace; `null` if invalid. */
export function parseFragment(markup: string): Element | null {
  const wrapped = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`;
  const parsed = parseSvg(wrapped);
  const children = parsed ? Array.from(parsed.root.children) : [];
  if (children.length !== 1) return null;
  // declarations the wrapper already makes would otherwise stay as attributes in the file
  const el = children[0];
  if (el.getAttribute('xmlns') === SVG_NS) el.removeAttribute('xmlns');
  if (el.getAttribute('xmlns:xlink') === 'http://www.w3.org/1999/xlink') {
    el.removeAttributeNS('http://www.w3.org/2000/xmlns/', 'xlink');
  }
  return el;
}
