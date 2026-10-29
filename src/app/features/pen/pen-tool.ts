import { PathEditService } from '../path-edit/path-edit.service';
import {
  addAnchor,
  hitAnchor,
  hitSegment,
  removeAnchor,
} from '../../shared/geometry/pen/path-model';
import { inject, Injectable } from '@angular/core';
import { apply, fromDom, invert } from '../../shared/geometry/matrix';
import { openTail, reverseAnchors, mapAnchors } from '../../shared/geometry/pen/pen-path';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { PenService } from './pen.service';
import { PenStore } from './pen.store';
import { PEN_TEXTS as T } from './pen-texts';

/** Pick distance of the first / last anchor and of path ends (screen pixels). */
export const PEN_PICK_PX = 8;

/**
 * The pen on the canvas (prompt 042): every point snapped (`DrawSnap`: the shapes, the anchors
 * placed, Smart Guides from the last one), a press places an anchor, dragging pulls its handles,
 * a press on the end of the selected open path goes on with it. Registers with `CanvasTools`.
 */
@Injectable({ providedIn: 'root' })
export class PenTool implements CanvasTool {
  readonly id = 'pen';
  private readonly pen = inject(PenStore);
  private readonly service = inject(PenService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private readonly pathEdit = inject(PathEditService);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), this.files);
  private pressed = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.pen.on();
  }

  stop(): void {
    this.pen.toggle(false);
  }

  private tol(): number {
    return PEN_PICK_PX / Math.max(this.view.zoom(), 1e-6);
  }

  private point(e: ToolPointer): Point {
    const anchors = this.pen.anchors();
    return this.snap.point(
      e,
      anchors.map((a) => a.p),
      anchors[anchors.length - 1]?.p ?? null,
    );
  }

  press(e: ToolPointer): void {
    const p = this.point(e);
    if (!this.pen.drawing() && this.goOn(this.snap.raw(e))) return;
    if (!this.pen.drawing() && this.autoEdit(this.snap.raw(e))) return;
    this.pen.press(p, { x: e.clientX, y: e.clientY }, this.tol(), !!e.shiftKey);
    this.pressed = true;
  }

  move(e: ToolPointer): void {
    const p = this.pen.dragging() && e.shiftKey ? this.snap.raw(e) : this.point(e);
    this.pen.move(p, { x: e.clientX, y: e.clientY }, { alt: e.altKey, shift: !!e.shiftKey });
  }

  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.pen.release()) void this.service.finish();
  }

  leave(): void {
    this.pen.hover.set(null);
    this.snap.clear();
  }

  escape(): boolean {
    if (this.pen.anchors().length >= 2) {
      void this.service.finish();
      return true;
    }
    if (this.pen.drawing()) {
      this.pen.reset();
      return true;
    }
    if (!this.pen.on()) return false;
    this.pen.toggle(false);
    return true;
  }

  hint(): string {
    return `${this.pen.drawing() ? T.pen.drawing : T.pen.start} · ${T.escEnds}`;
  }

  reset(): void {
    this.pen.reset();
  }

  /**
   * Auto Add/Delete (prompt 046, like VectorCraft): before drawing, a press on a point of a
   * selected path deletes it, a press on its outline adds one.
   */
  private autoEdit(p: Point): boolean {
    for (const t of this.pathEdit.targets()) {
      if (t.el.localName !== 'path') continue;
      const a = hitAnchor(t.subpaths, p, this.tol());
      if (a) {
        this.pathEdit.write(t, removeAnchor(t.subpaths, a.s, a.i));
        return true;
      }
      const s = hitSegment(t.subpaths, p, this.tol());
      if (s) {
        this.pathEdit.write(t, addAnchor(t.subpaths, s.s, s.i, s.t));
        return true;
      }
    }
    return false;
  }

  /** A press on an end of the selected open path: the pen goes on from there. */
  private goOn(p: Point): boolean {
    const store = this.files.store();
    const host = this.view.host;
    const refs = store?.selection() ?? [];
    if (!store || !host || refs.length !== 1) return false;
    const el = store.document().node(refs[0]);
    if (!(el instanceof SVGGraphicsElement) || el.localName !== 'path') return false;
    const tail = openTail(el.getAttribute('d') ?? '');
    const m = nodeToDocument(host, el);
    const toDoc = m ? fromDom(m) : null;
    const toLocal = toDoc ? invert(toDoc) : null;
    if (!tail || !toDoc || !toLocal) return false;
    const anchors = mapAnchors(tail.anchors, (q) => apply(toDoc, q));
    const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= this.tol();
    const atEnd = near(anchors[anchors.length - 1].p);
    if (!atEnd && !near(anchors[0].p)) return false;
    this.pen.startFrom(atEnd ? anchors : reverseAnchors(anchors), {
      ref: refs[0],
      prefix: tail.prefix,
      toLocal,
    });
    return true;
  }
}
