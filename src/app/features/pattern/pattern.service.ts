import { inject, Injectable, signal } from '@angular/core';
import { nodeBoundsInDocument, nodeToDocument } from '../../shared/geometry/dom-geometry';
import { fromDom, Matrix } from '../../shared/geometry/matrix';
import {
  circularPlacements,
  mirrorAcross,
  rectangularPlacements,
} from '../../shared/geometry/pattern';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { NodeRef } from '../document/icon-document';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import { Planned } from '../hierarchy/edit-operations';
import { linkedCloneCommand, patternCommand } from './pattern-copies';

export interface CircularOptions {
  center: Point;
  count: number;
  /** Total angle in degrees (360 = full turn). */
  angle: number;
}

export interface RectangularOptions {
  columns: number;
  rows: number;
  dx: number;
  dy: number;
}

/** The dialog that is open: the kind and (circular) the picked centre. */
export type PatternDialogState =
  { kind: 'circular'; center: Point } | { kind: 'rectangular' } | null;

/**
 * Patterns, Mirror and Clone (prompt 049, like Fusion 360): copies of the selected nodes at
 * placements in document space, one undo step, the copies selected. The dialog previews live:
 * every change replaces the preview copies (an undo gesture), OK keeps them, Cancel takes them
 * back.
 */
@Injectable({ providedIn: 'root' })
export class PatternService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  readonly dialog = signal<PatternDialogState>(null);
  /** The originals of the running preview. */
  private previewing: { refs: readonly NodeRef[]; label: UndoLabel } | null = null;
  private lastPlan: Planned | null = null;

  refs(): readonly NodeRef[] {
    return this.previewing?.refs ?? this.files.store()?.selection() ?? [];
  }

  canRun(): boolean {
    return this.refs().length > 0;
  }

  private toDoc = (parent: Element): Matrix | null => {
    const host = this.view.host;
    const m = host && parent instanceof SVGGraphicsElement ? nodeToDocument(host, parent) : null;
    return m ? fromDom(m) : null;
  };

  /** The bounds of the selection in document units. */
  bounds(): { x: number; y: number; width: number; height: number } | null {
    const store = this.files.store();
    const host = this.view.host;
    if (!store || !host) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const ref of this.refs()) {
      const el = store.document().node(ref);
      const b = el instanceof SVGGraphicsElement ? nodeBoundsInDocument(host, el) : null;
      if (b) xs.push(b.x, b.x + b.width);
      if (b) ys.push(b.y, b.y + b.height);
    }
    if (!xs.length) return null;
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  center(): Point {
    const b = this.bounds();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 512, y: 512 };
  }

  private plan(placements: readonly Matrix[], label: UndoLabel): Planned | null {
    const store = this.files.store();
    if (!store) return null;
    return patternCommand(store.document(), this.refs(), placements, this.toDoc, label);
  }

  private run(plan: Planned | null): boolean {
    const store = this.files.store();
    if (!store || !plan) return false;
    store.execute(plan.command);
    store.selection.set(plan.selection().nodes);
    return true;
  }

  circular(o: CircularOptions): boolean {
    return this.run(this.plan(circularPlacements(o.center, o.count, o.angle), 'circularPattern'));
  }

  rectangular(o: RectangularOptions): boolean {
    return this.run(
      this.plan(rectangularPlacements(o.columns, o.rows, o.dx, o.dy), 'rectangularPattern'),
    );
  }

  /** Mirror copies across the line through `a` and `b` (the originals stay, like Fusion). */
  mirror(a: Point, b: Point): boolean {
    const m = mirrorAcross(a, b);
    return m ? this.run(this.plan([m], 'mirror')) : false;
  }

  /** Clone (linked): a `<use>` of each selected node. */
  clone(): boolean {
    const store = this.files.store();
    return store ? this.run(linkedCloneCommand(store.document(), store.selection())) : false;
  }

  /** The dialog's live preview: replaces the copies shown before. */
  preview(
    o: ({ kind: 'circular' } & CircularOptions) | ({ kind: 'rectangular' } & RectangularOptions),
  ): void {
    const store = this.files.store();
    if (!store) return;
    const label: UndoLabel = o.kind === 'circular' ? 'circularPattern' : 'rectangularPattern';
    if (this.previewing) store.cancel();
    else this.previewing = { refs: [...store.selection()], label };
    const placements =
      o.kind === 'circular'
        ? circularPlacements(o.center, o.count, o.angle)
        : rectangularPlacements(o.columns, o.rows, o.dx, o.dy);
    const plan = this.plan(placements, label);
    store.begin(label);
    if (plan) store.update(plan.command);
    this.lastPlan = plan;
  }

  /** OK: the preview stays (one undo step), the copies are selected. */
  commitPreview(): boolean {
    const store = this.files.store();
    if (!store || !this.previewing) return false;
    store.commit();
    const plan = this.lastPlan;
    this.previewing = null;
    this.lastPlan = null;
    if (plan) store.selection.set(plan.selection().nodes);
    return !!plan;
  }

  /** Cancel: the preview goes, the selection is as before. */
  cancelPreview(): void {
    const store = this.files.store();
    const p = this.previewing;
    this.previewing = null;
    this.lastPlan = null;
    if (!store || !p) return;
    store.cancel();
    store.selection.set(p.refs);
  }
}
