import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { apply, fromDom } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { IconDocument, NodeRef } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { boxKeyPoints } from './edit-ops';
import { readGeometry } from './handles/node-geometry';
import { handlesOf } from './handles/node-handles';
import { isRendered, paintedRoots } from './hit-test';

/** Most candidates collected for one gesture. */
export const MAX_MAGIC_POINTS = 20_000;

/**
 * Marked points for Magic Snap (design 007 E13; template `MagicSnapPointCollector`): per painted
 * leaf of every visible layer – also in other groups and assets – the corners, edge midpoints and
 * centre of its local bounding box and its point handles (path anchors, polygon points, line
 * ends, circle centres), all mapped to the document with the browser's matrices; plus corners,
 * edge midpoints and centre of the canvas. Nodes being dragged (and their descendants) are left
 * out. Collected once when a gesture starts.
 */
export function magicPoints(
  box: HTMLElement,
  host: SVGSVGElement | null,
  doc: IconDocument,
  exclude: readonly NodeRef[],
): Point[] {
  const out: Point[] = boxKeyPoints({ x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE });
  if (!host) return out;
  const moving = exclude.flatMap((r) => {
    const el = doc.node(r);
    return el ? [{ asset: r.asset, el }] : [];
  });
  for (const { asset, root } of paintedRoots(box)) {
    for (const el of root.querySelectorAll('*')) {
      if (out.length >= MAX_MAGIC_POINTS) return out;
      if (!(el instanceof SVGGraphicsElement) || el.children.length > 0) continue;
      const id = el.getAttribute(ID_ATTR);
      const live = id ? doc.node({ asset, id }) : null;
      if (!live || moving.some((m) => m.asset === asset && m.el.contains(live))) continue;
      if (!isRendered(el, root)) continue;
      const m = nodeToDocument(host, el);
      if (!m) continue;
      const toDoc = fromDom(m);
      let local: Point[];
      try {
        const b = el.getBBox();
        local = boxKeyPoints({ x: b.x, y: b.y, width: b.width, height: b.height });
      } catch {
        local = [];
      }
      const g = readGeometry(el);
      if (g.kind !== 'rect' && g.kind !== 'text' && g.kind !== 'box') {
        local.push(
          ...handlesOf(g)
            .filter((h) => h.kind !== 'midpoint' && h.kind !== 'control')
            .map((h) => h.local),
        );
      }
      for (const p of local) out.push(apply(toDoc, p));
    }
  }
  return out.slice(0, MAX_MAGIC_POINTS);
}
