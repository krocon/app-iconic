import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, invert } from '../../shared/geometry/matrix';
import { fromSubpaths, mapSubpaths } from '../../shared/geometry/pen/path-model';
import { isRendered, paintedRoots } from '../canvas/hit-test';
import { IconDocument } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { PathTarget, shapeSubpaths } from '../path-edit/path-edit.service';
import { isLocked } from '../lock/lock';

/** Most outlines Trim / Extend look at (huge imported icons). */
export const MAX_SCENE = 5000;

/** An outline of the scene: the element, its path data and bounds in document units. */
export interface SceneShape extends PathTarget {
  d: string;
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Locked (prompt 055): a boundary only, never cut / extended / rounded (prompt 064). */
  locked: boolean;
}

/**
 * Every painted, visible shape with an outline (rect, circle, line, path …) in document units –
 * what Trim and Extend cut against (prompt 050). Copies of an asset in other layers count once.
 */
export function sceneShapes(
  doc: IconDocument,
  box: HTMLElement | null,
  host: SVGSVGElement | null,
): SceneShape[] {
  if (!box || !host) return [];
  const out: SceneShape[] = [];
  const seen = new Set<string>();
  for (const { asset, root } of paintedRoots(box)) {
    for (const painted of root.querySelectorAll('*')) {
      if (out.length >= MAX_SCENE) return out;
      const id = painted.getAttribute(ID_ATTR);
      if (!id || seen.has(`${asset}:${id}`) || painted.children.length) continue;
      seen.add(`${asset}:${id}`);
      if (!isRendered(painted, root)) continue;
      const ref = { asset, id };
      const el = doc.node(ref);
      const sub = el ? shapeSubpaths(el) : null;
      const m = el instanceof SVGGraphicsElement ? nodeToDocument(host, el) : null;
      const toDoc = m ? fromDom(m) : null;
      const toLocal = toDoc ? invert(toDoc) : null;
      if (!el || !sub?.length || !toDoc || !toLocal) continue;
      const subpaths = mapSubpaths(sub, (p) => apply(toDoc, p));
      const xs: number[] = [];
      const ys: number[] = [];
      for (const s of subpaths) {
        for (const a of s.anchors) {
          for (const q of [a.p, a.hin, a.hout]) {
            if (!q) continue;
            xs.push(q.x);
            ys.push(q.y);
          }
        }
      }
      out.push({
        ref,
        el,
        locked: isLocked(el),
        toLocal,
        subpaths,
        d: fromSubpaths(subpaths),
        box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
      });
    }
  }
  return out;
}

export function boxesMeet(a: SceneShape['box'], b: SceneShape['box'], pad = 0): boolean {
  return a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;
}
