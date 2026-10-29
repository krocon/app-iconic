import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { localBBox } from '../../shared/geometry/clip-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { apply, fromDom } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { IconDocument, NodeRef } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { boxKeyPoints } from './edit-ops';
import { readGeometry } from './handles/node-geometry';
import { handlesOf } from './handles/node-handles';
import { SnapCandidate } from '../../shared/geometry/snapping';
import { Outline } from '../../shared/geometry/sketch/intersections';
import { collectSketchTargets, crossingPoints, sceneOutlines } from '../sketch/sketch-targets';
import { isRendered, paintedRoots } from './hit-test';

/** Most candidates collected for one gesture. */
export const MAX_MAGIC_POINTS = 20_000;

/**
 * Marked points for Magic Snap (design 007 E13; template `MagicSnapPointCollector`): per painted
 * leaf of every visible layer – also in other groups and assets – the corners, edge midpoints and
 * centre of its local bounding box and its point handles (path anchors, polygon points, line
 * ends, circle centres), all mapped to the document with the browser's matrices; plus corners,
 * edge midpoints and centre of the canvas. Nodes being dragged (and their descendants) are left
 * out. Collected once when a gesture starts. In the clip path edit mode the shapes of `scope` (the
 * clip being edited) count as well (design 014 E7).
 */
export function magicPoints(
  box: HTMLElement,
  host: SVGSVGElement | null,
  doc: IconDocument,
  exclude: readonly NodeRef[],
  scope: Element | null = null,
): SnapCandidate[] {
  // the middle of a box is its centre; a rectangle's corners and the handles are anchors
  const tagged = (ps: Point[], corners: boolean): SnapCandidate[] =>
    ps.map((p, i) =>
      i === 4 ? { ...p, tag: 'center' } : corners && i % 2 === 0 ? { ...p, tag: 'anchor' } : p,
    );
  const out: SnapCandidate[] = tagged(
    boxKeyPoints({ x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }),
    false,
  );
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
      if (!isRendered(el, root, scope)) continue;
      const m = nodeToDocument(host, el);
      if (!m) continue;
      const toDoc = fromDom(m);
      const b = localBBox(el);
      const g = readGeometry(el);
      const local: SnapCandidate[] = b
        ? tagged(
            boxKeyPoints({ x: b.x, y: b.y, width: b.width, height: b.height }),
            g.kind === 'rect',
          )
        : [];
      if (g.kind !== 'rect' && g.kind !== 'text' && g.kind !== 'box') {
        local.push(
          ...handlesOf(g)
            .filter((h) => h.kind !== 'midpoint' && h.kind !== 'control')
            .map((h): SnapCandidate => ({ ...h.local, tag: 'anchor' })),
        );
      }
      for (const p of local) out.push(p.tag ? { ...apply(toDoc, p), tag: p.tag } : apply(toDoc, p));
    }
  }
  return out.slice(0, MAX_MAGIC_POINTS);
}

/** What a drag snaps to: marked points (with crossings) and outlines. */
export interface SnapSources {
  points: SnapCandidate[];
  outlines: Outline[];
}

/**
 * What a drag snaps to (Magic Snap, prompt 040): the marked points of the other shapes and,
 * outside the clip edit mode, where their outlines cross ("intersect") and the outlines
 * themselves (Smart Guides); the dragged nodes `exclude` left out.
 */
export function snapCandidates(
  box: HTMLElement,
  host: SVGSVGElement | null,
  doc: IconDocument,
  exclude: readonly NodeRef[],
  scope: Element | null,
  smart: boolean,
): SnapSources {
  const points: SnapCandidate[] = magicPoints(box, host, doc, exclude, scope);
  if (scope || !smart || !host) return { points, outlines: [] };
  const moving = exclude.flatMap((r) => {
    const el = doc.node(r);
    return el ? [{ asset: r.asset, el }] : [];
  });
  const skip = (asset: string, el: Element) => {
    const id = el.getAttribute(ID_ATTR);
    const live = id ? doc.node({ asset, id }) : null;
    return !!live && moving.some((m) => m.asset === asset && m.el.contains(live));
  };
  const targets = collectSketchTargets(box, host, skip);
  return { points: [...points, ...crossingPoints(targets)], outlines: sceneOutlines(targets) };
}
