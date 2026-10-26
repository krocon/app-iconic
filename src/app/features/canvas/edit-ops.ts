import { localDelta } from '../../shared/geometry/align';
import {
  BoxHandle,
  boxHandlePoint,
  computeScaleFactors,
  oppositeAnchor,
  scaleAbout,
} from '../../shared/geometry/box-math';
import { Rect } from '../../shared/geometry/dom-geometry';
import { apply, conjugate, invert, Matrix, translation } from '../../shared/geometry/matrix';
import { appendAffine, prependAffine, setItemArgs } from '../../shared/geometry/transform-text';
import { Point } from '../../shared/geometry/view-transform';
import { AttributeChange } from '../document/commands';
import { NodeRef } from '../document/icon-document';

/**
 * The attribute changes of canvas edits (design 007 E7, E11), pure: from snapshots taken when a
 * gesture starts (the matrices are the browser's, measured by `selection-measure.ts`) and the
 * current document point. One `setAttributes` command is made from the result.
 */

/** A node about to move or scale with the selection. */
export interface NodeSnap {
  ref: NodeRef;
  /** `transform` at the start. */
  transform: string | null;
  /** Parent user space → document (the space of the node's `transform`). */
  parent: Matrix;
}

/** Moves every node by `d` (document units): a translate in front, in the parent's space. */
export function moveChanges(nodes: readonly NodeSnap[], d: Point): AttributeChange[] {
  return nodes.flatMap((n) => {
    const l = localDelta(n.parent, d);
    if (!l) return [];
    return [
      { ref: n.ref, name: 'transform', value: prependAffine(n.transform, translation(l.x, l.y)) },
    ];
  });
}

/** Scales the box of ONE node in its own user space (`box` there, `toDoc` = node → document). */
export function scaleNodeChanges(
  n: { ref: NodeRef; transform: string | null; toDoc: Matrix; box: Rect },
  handle: BoxHandle,
  p: Point,
): AttributeChange[] | null {
  const inv = invert(n.toDoc);
  if (!inv) return null;
  const local = apply(inv, p);
  const anchor = oppositeAnchor(n.box, handle);
  const f = computeScaleFactors(handle, boxHandlePoint(n.box, handle), anchor, local);
  const m = scaleAbout(anchor, f.scaleX, f.scaleY);
  return [{ ref: n.ref, name: 'transform', value: appendAffine(n.transform, m) }];
}

/** Scales several nodes by the union box in document space (`P⁻¹·S·P` in front of each). */
export function scaleSelectionChanges(
  nodes: readonly NodeSnap[],
  box: Rect,
  handle: BoxHandle,
  p: Point,
): AttributeChange[] {
  const anchor = oppositeAnchor(box, handle);
  const f = computeScaleFactors(handle, boxHandlePoint(box, handle), anchor, p);
  const s = scaleAbout(anchor, f.scaleX, f.scaleY);
  return nodes.flatMap((n) => {
    const local = conjugate(s, n.parent);
    return local
      ? [{ ref: n.ref, name: 'transform', value: prependAffine(n.transform, local) }]
      : [];
  });
}

/**
 * Moves the pivot of the `rotate(a cx cy)` function `item` (design 007 E7): `toDoc` maps the space
 * the rotate works in to the document.
 */
export function pivotChanges(
  n: { ref: NodeRef; transform: string; item: number; angle: number; toDoc: Matrix },
  p: Point,
): AttributeChange[] | null {
  const inv = invert(n.toDoc);
  if (!inv) return null;
  const c = apply(inv, p);
  return [
    { ref: n.ref, name: 'transform', value: setItemArgs(n.transform, n.item, [n.angle, c.x, c.y]) },
  ];
}

/** The nine marked points of a box (corners, edge midpoints, centre) – snap keys of a move. */
export function boxKeyPoints(r: Rect): Point[] {
  const xs = [r.x, r.x + r.width / 2, r.x + r.width];
  const ys = [r.y, r.y + r.height / 2, r.y + r.height];
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}
