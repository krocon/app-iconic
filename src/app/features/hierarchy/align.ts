import { CompositeCommand, DocCommand, SetAttribute } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import {
  AlignMode,
  alignDeltas,
  DistributeAxis,
  DistributeKind,
  distributeDeltas,
  fmt,
  localDelta,
} from '../../shared/geometry/align';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { Point } from '../../shared/geometry/view-transform';
import { nodeBoundsInDocument, nodeToDocument, Rect } from '../../shared/geometry/dom-geometry';
import { paintedNodes } from './arrange-operations';

/** Moves below this (document units) are left out. */
const EPSILON = 0.001;

/** The painted nodes of the selection that have layout (a hidden layer has none). */
export function measurable(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
): { el: SVGGraphicsElement; rect: Rect }[] {
  if (!host) return [];
  return paintedNodes(doc, refs).flatMap((el) => {
    if (!el.isConnected || !(el instanceof SVGGraphicsElement)) return [];
    const rect = nodeBoundsInDocument(host, el);
    return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      ? [{ el, rect }]
      : [];
  });
}

/** What align lines up with (prompt 054): the selection's box, the canvas or the key object. */
export type AlignTo = 'selection' | 'canvas' | 'key';
export const ALIGN_TO: readonly AlignTo[] = ['selection', 'canvas', 'key'];

/** The canvas in document units. */
export const CANVAS_RECT: Rect = { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };

/** Moves `nodes` by document-space `deltas` (a translate in front of each node's transform). */
function moveCommand(
  doc: IconDocument,
  host: SVGSVGElement,
  nodes: readonly { el: SVGGraphicsElement }[],
  deltas: readonly Point[],
): DocCommand | null {
  const cmds: DocCommand[] = [];
  nodes.forEach(({ el }, i) => {
    const d = deltas[i];
    if (Math.abs(d.x) < EPSILON && Math.abs(d.y) < EPSILON) return;
    const parent = el.parentElement;
    const m = parent instanceof SVGGraphicsElement ? nodeToDocument(host, parent) : null;
    const l = m ? localDelta(m, d) : null;
    if (!l) return;
    const old = el.getAttribute('transform')?.trim();
    const t = `translate(${fmt(l.x)} ${fmt(l.y)})`;
    cmds.push(
      new SetAttribute(doc.refOf(el)!, 'transform', old ? `${t} ${old}` : t, 'changeTransform'),
    );
  });
  return cmds.length ? new CompositeCommand('changeTransform', cmds) : null;
}

/**
 * Align (design 006 E13; prompt 054: to the canvas or a key object): measured with the browser's
 * matrices (`getBBox` + screen CTMs, design 004 E11), applied as a `translate` put in front of each
 * node's `transform`, in the coordinate system of its parent. One undo step "Change Transform".
 * `null` if too few nodes can be measured (two; one for the canvas) or nothing moves.
 */
export function alignCommand(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  mode: AlignMode,
  to: AlignTo = 'selection',
  key: NodeRef | null = null,
): DocCommand | null {
  const nodes = measurable(doc, host, refs);
  if (!host || nodes.length < (to === 'canvas' ? 1 : 2)) return null;
  let reference: Rect | undefined;
  if (to === 'canvas') reference = CANVAS_RECT;
  if (to === 'key') {
    const k = key ? nodes.find((n) => n.el === doc.node(key)) : undefined;
    reference = k?.rect;
  }
  const deltas = alignDeltas(
    nodes.map((n) => n.rect),
    mode,
    reference,
  );
  return moveCommand(doc, host, nodes, deltas);
}

/** Distribute (prompt 054): at least three nodes, or two with a fixed gap. */
export function distributeCommand(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  axis: DistributeAxis,
  kind: DistributeKind,
  gap?: number,
): DocCommand | null {
  const nodes = measurable(doc, host, refs);
  if (!host || nodes.length < (gap === undefined ? 3 : 2)) return null;
  const deltas = distributeDeltas(
    nodes.map((n) => n.rect),
    axis,
    kind,
    gap,
  );
  return moveCommand(doc, host, nodes, deltas);
}
