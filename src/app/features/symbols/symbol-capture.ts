import { fmt } from '../../shared/geometry/align';
import { Rect } from '../../shared/geometry/dom-geometry';
import { BLACK } from '../commands/element-defaults';

/**
 * "Save as Symbol…" (prompt 084, design E12): the selected nodes as one standalone SVG. Each node
 * is cloned into a `<g transform="matrix(…)">` with the matrix the browser gives for its user
 * space in document units (`nodeToDocument`, its own `transform` is part of it) and the paint it
 * inherits from its ancestors; the viewBox is the union of their document bounds. Internal ids
 * (`data-ai-*`) are dropped; inline `style` paint becomes attributes (Rust keeps attributes only).
 * What a symbol cannot keep (text, images, gradients, filters, clips) is dropped by the cleaners.
 * Pure apart from the DOM of the clones.
 */

/** Presentation attributes that inherit (carried from the ancestors onto the wrapper). */
export const INHERITED_PAINT = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
] as const;
const STYLE_PROPS = new Set<string>([...INHERITED_PAINT, 'opacity']);

export interface CapturePart {
  el: Element;
  /** User space of `el` (with its own transform) → document units. */
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number };
  /** Bounds in document units. */
  bounds: Rect;
}

/** `style="fill: red; stroke-width: 2"` → the known paint properties. A plain declaration split. */
export function stylePaint(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of (style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    const v = decl
      .slice(i + 1)
      .replace(/!important/i, '')
      .trim();
    if (STYLE_PROPS.has(k) && v) out[k] = v;
  }
  return out;
}

/** The paint `el` inherits from its ancestors up to the asset's `<svg>` (nearest wins). */
export function inheritedPaint(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = stylePaint(p.getAttribute('style'));
    for (const k of INHERITED_PAINT) {
      if (out[k] !== undefined) continue;
      const v = style[k] ?? p.getAttribute(k);
      if (v !== null && v !== undefined) out[k] = v;
    }
    if (p.localName === 'svg') break;
  }
  return out;
}

/** Copies inline style paint onto attributes and drops internal ids, in the whole subtree. */
function tidy(root: Element): void {
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const style = stylePaint(el.getAttribute('style'));
    for (const [k, v] of Object.entries(style)) el.setAttribute(k, v);
    el.removeAttribute('style');
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('data-ai-') || a.name === 'id' || a.name === 'class') {
        el.removeAttribute(a.name);
      }
    }
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The SVG of the parts, or `null` without anything measurable. */
export function captureMarkup(parts: readonly CapturePart[]): string | null {
  const ok = parts.filter(
    (p) =>
      [p.bounds.x, p.bounds.y, p.bounds.width, p.bounds.height].every(Number.isFinite) &&
      Object.values(p.matrix).every(Number.isFinite),
  );
  if (!ok.length) return null;
  const x0 = Math.min(...ok.map((p) => p.bounds.x));
  const y0 = Math.min(...ok.map((p) => p.bounds.y));
  const x1 = Math.max(...ok.map((p) => p.bounds.x + p.bounds.width));
  const y1 = Math.max(...ok.map((p) => p.bounds.y + p.bounds.height));
  // a horizontal line has no height: give the box at least one unit
  const w = Math.max(x1 - x0, 1);
  const h = Math.max(y1 - y0, 1);
  const doc = document.implementation.createDocument(SVG_NS, 'svg', null);
  const svg = doc.documentElement;
  svg.setAttribute('viewBox', `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}`);
  for (const p of ok) {
    const g = doc.createElementNS(SVG_NS, 'g');
    const { a, b, c, d, e, f } = p.matrix;
    g.setAttribute('transform', `matrix(${[a, b, c, d, e, f].map((n) => fmt(n)).join(' ')})`);
    const paint = { fill: BLACK, ...inheritedPaint(p.el) };
    for (const [k, v] of Object.entries(paint)) g.setAttribute(k, v);
    const clone = doc.importNode(p.el, true) as Element;
    // its own transform is part of the matrix
    clone.removeAttribute('transform');
    tidy(clone);
    g.appendChild(clone);
    svg.appendChild(g);
  }
  return new XMLSerializer().serializeToString(svg);
}
