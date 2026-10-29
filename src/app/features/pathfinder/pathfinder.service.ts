import { inject, Injectable } from '@angular/core';
import { apply } from '../../shared/geometry/matrix';
import {
  divide,
  loadPaper,
  PaperScope,
  pathfinder,
  PathfinderOp,
  Region,
  Shape,
} from '../../shared/geometry/pathops/boolean-ops';
import { fromSubpaths, mapSubpaths, toSubpaths } from '../../shared/geometry/pen/path-model';
import { CompositeCommand, DocCommand, InsertNode, RemoveNode } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import { PathEditService, pathMarkup, PathTarget } from '../path-edit/path-edit.service';
import { PATHFINDER_TEXTS as T } from './pathfinder-texts';

/** A new path made from `source` (its look, its parent, its place in the z-order). */
export interface Piece {
  source: PathTarget;
  /** Path data in document units. */
  d: string;
}

/**
 * Pathfinder and the shared plumbing of Shape Builder and the cuts (prompt 047): the selected
 * shapes in z-order as filled areas, results written as new `<path>`s in place of the old ones –
 * one undo step, the new paths selected.
 */
@Injectable({ providedIn: 'root' })
export class PathfinderService {
  private readonly files = inject(FilesService);
  private readonly paths = inject(PathEditService);

  /** The selected shapes back to front. */
  targets(): PathTarget[] {
    return this.paths
      .targets()
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
  }

  canRun(min = 2): boolean {
    return this.targets().length >= min;
  }

  shapeOf(t: PathTarget): Shape {
    const rule = getComputedStyle(t.el).fillRule || t.el.getAttribute('fill-rule');
    return { d: fromSubpaths(t.subpaths), evenOdd: rule === 'evenodd' };
  }

  paper(): Promise<PaperScope> {
    return loadPaper();
  }

  /** Unite, Minus Front, Intersect, Exclude: one path in place of the selected shapes. */
  async run(op: PathfinderOp): Promise<boolean> {
    const ts = this.targets();
    if (ts.length < 2) return false;
    const d = pathfinder(
      await this.paper(),
      op,
      ts.map((t) => this.shapeOf(t)),
    );
    if (!d) {
      this.files.notice.set(T.empty);
      return false;
    }
    // Minus Front keeps the back shape's look, the others the front one's (like Illustrator)
    const keeper = op === 'minusFront' ? ts[0] : ts[ts.length - 1];
    return this.replace(ts, [{ source: keeper, d }], 'pathfinder');
  }

  /** Divide: every face of the selected shapes its own path. */
  async divide(): Promise<boolean> {
    const ts = this.targets();
    if (ts.length < 2) return false;
    const regions = divide(
      await this.paper(),
      ts.map((t) => this.shapeOf(t)),
    );
    return this.replace(ts, this.piecesOf(ts, regions), 'divide');
  }

  piecesOf(ts: readonly PathTarget[], regions: readonly Region[]): Piece[] {
    return regions.map((r) => ({ source: ts[r.source], d: r.d }));
  }

  /**
   * Replaces `old` by `pieces` (each before its source, in order); one undo step, the pieces
   * selected. `false` when nothing was written.
   */
  replace(old: readonly PathTarget[], pieces: readonly Piece[], label: UndoLabel): boolean {
    const store = this.files.store();
    if (!store || !old.length) return false;
    const doc = store.document();
    const sim = new Map<Element, Element[]>();
    const inserts: InsertNode[] = [];
    for (const p of pieces) {
      const parent = p.source.el.parentElement;
      const parentRef = parent ? doc.refOf(parent) : null;
      const sub = toSubpaths(p.d);
      if (!parent || !parentRef || !sub?.length) continue;
      const list = sim.get(parent) ?? [...Array.from(parent.children)];
      sim.set(parent, list);
      const at = list.indexOf(p.source.el);
      const d = fromSubpaths(mapSubpaths(sub, (q) => apply(p.source.toLocal, q)));
      const marker = parent.ownerDocument.createElementNS(parent.namespaceURI, 'path');
      list.splice(at, 0, marker);
      inserts.push(new InsertNode(parentRef, pathMarkup(p.source.el, d, false), at, label));
    }
    const cmds: DocCommand[] = [...inserts, ...old.map((t) => new RemoveNode(t.ref))];
    store.execute(new CompositeCommand(label, cmds));
    store.selection.set(inserts.map((i) => i.ref).filter((r): r is NodeRef => r !== null));
    return true;
  }
}
