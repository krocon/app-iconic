import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { fromDom, invert, Matrix } from '../../shared/geometry/matrix';
import { Point, ViewTransform, viewToDocument } from '../../shared/geometry/view-transform';

/**
 * The centre a new element is put on (design 008 E3): the middle of the visible part of the
 * canvas in document units (from the view transform), clamped onto the artboard, then mapped into
 * the user space of the parent with the inverse of the browser's matrix (`nodeToDocument`, design
 * 004 E11) – exact for transformed groups and placed assets of another size.
 */

/** Middle of the viewport in document units, on the artboard; the artboard's middle without a viewport. */
export function visibleCenter(
  view: ViewTransform,
  viewport: { width: number; height: number },
): Point {
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    return { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
  }
  const p = viewToDocument(view, { x: viewport.width / 2, y: viewport.height / 2 });
  const clamp = (v: number) => Math.min(CANVAS_SIZE, Math.max(0, v));
  return { x: clamp(p.x), y: clamp(p.y) };
}

/**
 * `p` (document units) in the user space of `parent`; unchanged when the parent is not rendered
 * (hidden layer) or there is no canvas (tests).
 */
export function toLocal(host: SVGSVGElement | null, parent: Element | null, p: Point): Point {
  if (!host || !parent || typeof (parent as SVGGraphicsElement).getScreenCTM !== 'function') {
    return p;
  }
  const m = nodeToDocument(host, parent as SVGGraphicsElement);
  if (!m || ![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) return p;
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return p;
  const q = new DOMPoint(p.x, p.y).matrixTransform(m.inverse());
  return Number.isFinite(q.x) && Number.isFinite(q.y) ? { x: q.x, y: q.y } : p;
}

/**
 * The matrix document → user space of `parent` (design 019 E11); `null` when the parent is not
 * rendered or there is no canvas (then document units are used as they are, like `toLocal`).
 */
export function localMatrix(host: SVGSVGElement | null, parent: Element | null): Matrix | null {
  if (!host || !parent || typeof (parent as SVGGraphicsElement).getScreenCTM !== 'function') {
    return null;
  }
  const m = nodeToDocument(host, parent as SVGGraphicsElement);
  if (!m || ![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) return null;
  return invert(fromDom(m));
}
