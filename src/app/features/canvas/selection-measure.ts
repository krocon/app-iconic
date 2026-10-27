import { Rect, nodeBoundsInDocument, nodeToDocument } from '../../shared/geometry/dom-geometry';
import { localBBox } from '../../shared/geometry/clip-geometry';
import { apply, fromDom, IDENTITY, invert, Matrix, multiply } from '../../shared/geometry/matrix';
import { transformItems } from '../../shared/geometry/transform-text';
import { Point } from '../../shared/geometry/view-transform';
import { unionRect } from '../../shared/geometry/align';
import { IconDocument, NodeRef } from '../document/icon-document';
import { paintedNodes } from '../hierarchy/arrange-operations';
import { NodeSnap } from './edit-ops';
import { Handle, HandleKind } from './handles/handle-types';
import { NodeGeometry, readGeometry } from './handles/node-geometry';
import { boxHandles, handlesOf, wantsBox } from './handles/node-handles';
import { isRendered } from './hit-test';

/**
 * Measures the selection with the browser's matrices (design 007 E1, E5): frames (the local
 * bounding box of each node mapped to the document – rotated / skewed like the node), the handle
 * sets of the selection mode and the snapshots a gesture starts from. Needs layout (Playwright).
 */

export type SelectionMode = 'none' | 'point' | 'boxed';

export interface PointSet {
  kind: 'point';
  ref: NodeRef;
  /** Node user space → document. */
  toDoc: Matrix;
  geometry: NodeGeometry;
  handles: Handle[];
}

export interface BoxSet {
  kind: 'box';
  /** One node: its user space (the box is its local bbox); several: the document (union). */
  toDoc: Matrix;
  box: Rect;
  single: { ref: NodeRef; transform: string | null } | null;
  handles: Handle[];
}

export interface PivotSet {
  kind: 'pivot';
  ref: NodeRef;
  /** The space the `rotate` works in → document. */
  toDoc: Matrix;
  transform: string;
  item: number;
  angle: number;
  handles: Handle[];
}

export type HandleSet = PointSet | BoxSet | PivotSet;

export interface SelectionModel {
  /** Per node the corners of its local bbox in document units. */
  frames: Point[][];
  sets: HandleSet[];
  /** Union of the document bounds of the selection. */
  union: Rect | null;
}

export const EMPTY_MODEL: SelectionModel = { frames: [], sets: [], union: null };

interface Measured {
  ref: NodeRef;
  el: SVGGraphicsElement;
  toDoc: Matrix;
  bbox: Rect;
}

function bboxOf(el: SVGGraphicsElement): Rect | null {
  try {
    // shapes of a clip path through a rendered copy (WebKit, design 014 E8)
    const b = localBBox(el);
    if (!b) return null;
    return [b.x, b.y, b.width, b.height].every(Number.isFinite)
      ? { x: b.x, y: b.y, width: b.width, height: b.height }
      : null;
  } catch {
    return null;
  }
}

/**
 * The painted, rendered nodes of `refs` with their matrices (nodes inside selected ones left out).
 * `scope` = the clip path being edited: its shapes count as painted (design 014 E7).
 */
function measure(
  doc: IconDocument,
  host: SVGSVGElement,
  refs: readonly NodeRef[],
  scope: Element | null,
): Measured[] {
  const els = paintedNodes(doc, refs, scope);
  return els.flatMap((el) => {
    if (!(el instanceof SVGGraphicsElement) || !el.isConnected) return [];
    if (els.some((o) => o !== el && o.contains(el))) return [];
    const ref = doc.refOf(el);
    const root = ref ? doc.asset(ref.asset)?.svg?.root : null;
    if (root && !isRendered(el, root, scope)) return [];
    const m = nodeToDocument(host, el);
    const bbox = bboxOf(el);
    return m && bbox && ref ? [{ ref, el, toDoc: fromDom(m), bbox }] : [];
  });
}

function corners(r: Rect, m: Matrix): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ].map((p) => apply(m, p));
}

/** Product of the browser's matrices of the transform functions `[0, end)`. */
function itemsMatrix(el: SVGGraphicsElement, end: number): Matrix {
  const list = el.transform.baseVal;
  let m = IDENTITY;
  for (let i = 0; i < Math.min(end, list.numberOfItems); i++)
    m = multiply(m, fromDom(list.getItem(i).matrix));
  return m;
}

/** The pivot of the first `rotate(a cx cy)` (design 007 E7). */
function pivotSet(n: Measured): PivotSet | null {
  const text = n.el.getAttribute('transform');
  const items = transformItems(text);
  if (!text || items.length !== n.el.transform.baseVal.numberOfItems) return null;
  const item = items.findIndex((i) => i.name === 'rotate' && i.args.length === 3);
  if (item < 0) return null;
  const own = invert(itemsMatrix(n.el, items.length));
  if (!own) return null;
  const pre = multiply(n.toDoc, multiply(own, itemsMatrix(n.el, item)));
  const [angle, cx, cy] = items[item].args;
  const handle: Handle = {
    id: 'pivot',
    kind: 'pivot' as HandleKind,
    role: { t: 'pivot', item },
    local: { x: cx, y: cy },
    label: 'Rotation Pivot',
  };
  return { kind: 'pivot', ref: n.ref, toDoc: pre, transform: text, item, angle, handles: [handle] };
}

export function measureSelection(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  mode: SelectionMode,
  showHandles: boolean,
  scope: Element | null = null,
): SelectionModel {
  if (!host || refs.length === 0) return EMPTY_MODEL;
  const nodes = measure(doc, host, refs, scope);
  if (nodes.length === 0) return EMPTY_MODEL;
  const frames = nodes.map((n) => corners(n.bbox, n.toDoc));
  const xs = frames.flat().map((p) => p.x);
  const ys = frames.flat().map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const union: Rect = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  const sets: HandleSet[] = [];
  if (showHandles && mode !== 'none') {
    if (nodes.length === 1) {
      const n = nodes[0];
      const box: BoxSet = {
        kind: 'box',
        toDoc: n.toDoc,
        box: n.bbox,
        single: { ref: n.ref, transform: n.el.getAttribute('transform') },
        handles: boxHandles(n.bbox),
      };
      if (mode === 'point') {
        const geometry = readGeometry(n.el);
        if (wantsBox(geometry)) sets.push(box);
        sets.push({
          kind: 'point',
          ref: n.ref,
          toDoc: n.toDoc,
          geometry,
          handles: handlesOf(geometry),
        });
      } else {
        sets.push(box);
      }
      const pivot = pivotSet(n);
      if (pivot) sets.push(pivot);
    } else {
      sets.push({
        kind: 'box',
        toDoc: IDENTITY,
        box: union,
        single: null,
        handles: boxHandles(union),
      });
    }
  }
  return { frames, sets, union };
}

/** Snapshots for moving / scaling the selection (design 007 E11): transform + parent matrix. */
export function nodeSnaps(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  scope: Element | null = null,
): NodeSnap[] {
  if (!host) return [];
  return measure(doc, host, refs, scope).flatMap((n) => {
    const parent = n.el.parentElement;
    // the parent of a clip shape is its <clipPath> (no SVGGraphicsElement, mapped by the clip)
    const m =
      parent instanceof SVGGraphicsElement || parent?.localName === 'clipPath'
        ? nodeToDocument(host, parent as unknown as SVGGraphicsElement)
        : null;
    return m ? [{ ref: n.ref, transform: n.el.getAttribute('transform'), parent: fromDom(m) }] : [];
  });
}

/** Union of the document bounds of nodes (for the BoundsGuard and the snap keys of a move). */
export function unionBounds(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  scope: Element | null = null,
): Rect | null {
  if (!host) return null;
  const rects = measure(doc, host, refs, scope).flatMap((n) => {
    const r = nodeBoundsInDocument(host, n.el);
    return r ? [r] : [];
  });
  return rects.length ? unionRect(rects) : null;
}
