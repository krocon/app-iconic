import { CompositeCommand, DocCommand, SetAttribute } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { AlignMode, alignDeltas, fmt, localDelta } from '../../shared/geometry/align';
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

/**
 * Align (design 006 E13): measured with the browser's matrices (`getBBox` + screen CTMs, design
 * 004 E11), applied as a `translate` put in front of each node's `transform`, in the coordinate
 * system of its parent. One undo step "Change Transform". `null` if fewer than two nodes can be
 * measured or nothing moves.
 */
export function alignCommand(
  doc: IconDocument,
  host: SVGSVGElement | null,
  refs: readonly NodeRef[],
  mode: AlignMode,
): DocCommand | null {
  const nodes = measurable(doc, host, refs);
  if (nodes.length < 2 || !host) return null;
  const deltas = alignDeltas(
    nodes.map((n) => n.rect),
    mode,
  );
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
