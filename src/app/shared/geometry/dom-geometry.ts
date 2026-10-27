import { clipSpaceToDocument, enclosingClipPath, localBBox } from './clip-geometry';
import { Point } from './view-transform';

/** An axis-parallel rectangle in document units. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Screen ↔ document with the browser's own matrices (design 004 E11, CLAUDE.md §4 – no transform
 * chain of our own). `host` is the canvas's overlay `<svg viewBox="0 0 1024 1024">`, which lies
 * exactly on top of every layer host. Needs real layout: tested in Playwright.
 */

/** Document point under a client (viewport-of-the-window) position, e.g. of a pointer event. */
export function clientToDocument(
  host: SVGSVGElement,
  p: { clientX: number; clientY: number },
): Point {
  const m = host.getScreenCTM();
  if (!m) return { x: NaN, y: NaN };
  const d = new DOMPoint(p.clientX, p.clientY).matrixTransform(m.inverse());
  return { x: d.x, y: d.y };
}

/** Client position of a document point. */
export function documentToClient(
  host: SVGSVGElement,
  p: Point,
): { clientX: number; clientY: number } {
  const m = host.getScreenCTM();
  if (!m) return { clientX: NaN, clientY: NaN };
  const c = new DOMPoint(p.x, p.y).matrixTransform(m);
  return { clientX: c.x, clientY: c.y };
}

/**
 * The matrix from the user space of `el` (an element of a live asset, inside its layer's shadow
 * root) to document units. `el.getCTM()` stops at the nearest viewport element – the asset's own
 * `<svg>` or the placement `<svg>` – so both screen CTMs are combined instead. Shapes of a
 * `<clipPath>` (and the `<clipPath>` itself) map through the element that uses the clip (design
 * 014 E8).
 */
export function nodeToDocument(host: SVGSVGElement, el: SVGGraphicsElement): DOMMatrix | null {
  if (enclosingClipPath(el)) return clipSpaceToDocument(host, el);
  const h = host.getScreenCTM();
  const e = el.getScreenCTM();
  return h && e ? h.inverse().multiply(e) : null;
}

/** Bounds of `el` in document units: its `getBBox()` corners mapped by {@link nodeToDocument}. */
export function nodeBoundsInDocument(host: SVGSVGElement, el: SVGGraphicsElement): Rect | null {
  const m = nodeToDocument(host, el);
  const b = m ? localBBox(el) : null;
  if (!m || !b) return null;
  const pts = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
