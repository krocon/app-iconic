import { clipOwnerOf, clipShapeAt, insideClips } from '../../shared/geometry/clip-geometry';
import { IconDocument, NodeRef } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';

/**
 * Hit testing of the canvas (design 007 E2). The layer hosts take no pointer events (design 004),
 * so the hit is found here and not from the event target: per painted layer from top to bottom and
 * per element in reverse document order with the browser's own tests – `isPointInFill` /
 * `isPointInStroke` at the point mapped into the element's user space (`getScreenCTM()⁻¹`), or the
 * bounding box for text, images and `use`. Strokes get a tolerance of a few SCREEN pixels (thin
 * lines stay hittable at every zoom). Needs layout: tested in Playwright.
 */

/** Never hit: definitions and other non-rendered content (`defs`, `clipPath` …). */
const NOT_RENDERED = new Set([
  'defs',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'linearGradient',
  'radialGradient',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
]);

/** Stroke tolerance in screen pixels. */
export const HIT_TOLERANCE_PX = 4;

export interface Hit {
  asset: string;
  /** `data-ai-id` of the element hit (a leaf; may be in a copy of the asset, design 004 E5). */
  id: string;
}

/** The asset roots painted in the layer box, top layer first. */
export function paintedRoots(box: HTMLElement): { asset: string; root: SVGSVGElement }[] {
  return [...box.querySelectorAll<HTMLElement>('.layer')].reverse().flatMap((layer) => {
    const root = layer.shadowRoot?.querySelector('svg.placement')?.firstElementChild;
    const asset = layer.dataset['asset'];
    return root instanceof SVGSVGElement && asset ? [{ asset, root }] : [];
  });
}

/**
 * `el` and its ancestors up to `root` are rendered (no definition, no `display: none` …). Inside
 * `scope` – the clip path being edited (design 014 E7) – definitions count as rendered.
 */
export function isRendered(el: Element, root: Element, scope: Element | null = null): boolean {
  const inScope = !!scope && scope.contains(el);
  for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) {
    if (NOT_RENDERED.has(e.localName) && !inScope) return false;
    const cs = globalThis.getComputedStyle?.(e);
    if (cs && cs.display === 'none') return false;
  }
  const cs = globalThis.getComputedStyle?.(el);
  return !cs || cs.visibility !== 'hidden';
}

function local(inv: DOMMatrix, x: number, y: number): DOMPoint {
  return new DOMPoint(x, y).matrixTransform(inv);
}

function inBox(el: SVGGraphicsElement, p: DOMPoint): boolean {
  try {
    const b = el.getBBox();
    return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  } catch {
    return false;
  }
}

/** The element is under the client point (`tol` screen px around it for strokes). */
export function hitsElement(
  el: SVGGraphicsElement,
  clientX: number,
  clientY: number,
  tol: number,
): boolean {
  const m = el.getScreenCTM();
  if (!m) return false;
  const inv = m.inverse();
  const p = local(inv, clientX, clientY);
  if (!(el instanceof SVGGeometryElement)) return inBox(el, p);
  const cs = getComputedStyle(el);
  try {
    if (cs.fill !== 'none' && el.isPointInFill(p)) return true;
    if (cs.stroke === 'none') return false;
    if (el.isPointInStroke(p)) return true;
    // rings of 1 … tol screen px around the point, 8 directions each
    for (let r = 1; r <= tol; r++) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const q = local(inv, clientX + r * Math.cos(a), clientY + r * Math.sin(a));
        if (el.isPointInStroke(q)) return true;
      }
    }
  } catch {
    return inBox(el, p);
  }
  return false;
}

/**
 * The topmost painted element under the client point, or `null`. Clips count (design 014 E9): a
 * point that a clip cuts away hits what lies below.
 */
export function hitTest(
  box: HTMLElement,
  p: { clientX: number; clientY: number },
  tol = HIT_TOLERANCE_PX,
): Hit | null {
  for (const { asset, root } of paintedRoots(box)) {
    const els = [...root.querySelectorAll('*')].reverse();
    for (const el of els) {
      if (!(el instanceof SVGGraphicsElement) || el instanceof SVGGElement) continue;
      if (el instanceof SVGSVGElement || el.localName === 'a' || el.localName === 'switch')
        continue;
      if (!isRendered(el, root)) continue;
      if (!hitsElement(el, p.clientX, p.clientY, tol)) continue;
      if (!insideClips(el, root, p.clientX, p.clientY)) continue;
      const id = el.getAttribute(ID_ATTR);
      if (id) return { asset, id };
    }
  }
  return null;
}

/** The topmost shape of the clip path `clip` (live, being edited) under the point (design 014 E7). */
export function hitClipShape(
  doc: IconDocument,
  clip: NodeRef,
  p: { clientX: number; clientY: number },
): Hit | null {
  const el = doc.node(clip);
  const owner = el ? clipOwnerOf(el) : null;
  const shape = el && owner ? clipShapeAt(owner, el, p.clientX, p.clientY) : null;
  const id = shape?.getAttribute(ID_ATTR);
  return id ? { asset: clip.asset, id } : null;
}

/**
 * What a click on `hit` selects (design 007 E3): the child of the context (default: the asset
 * root) that contains the element hit. `context` is `null` when the hit lies outside it.
 */
export function selectableRef(
  doc: IconDocument,
  hit: Hit,
  context: NodeRef | null,
): { ref: NodeRef; inContext: boolean } | null {
  const leaf = doc.node({ asset: hit.asset, id: hit.id });
  const root = doc.asset(hit.asset)?.svg?.root;
  if (!leaf || !root) return null;
  const ctx = context && context.asset === hit.asset ? doc.node(context) : null;
  const inContext = !!ctx && ctx !== leaf && ctx.contains(leaf);
  const top = inContext ? ctx! : root;
  let el: Element = leaf;
  while (el.parentElement && el.parentElement !== top) el = el.parentElement;
  if (el.parentElement !== top) return null;
  const ref = doc.refOf(el);
  return ref ? { ref, inContext } : null;
}

/** Containers a double click enters (design 007 E3). */
export function isEnterable(el: Element | null): boolean {
  return !!el && ['g', 'a', 'switch', 'svg'].includes(el.localName) && el.children.length > 0;
}
