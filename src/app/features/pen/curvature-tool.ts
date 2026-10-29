import { inject, Injectable } from '@angular/core';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, invert } from '../../shared/geometry/matrix';
import { mapAnchors, singlePath } from '../../shared/geometry/pen/pen-path';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { CurvatureService } from './curvature.service';
import { CurvatureStore } from './curvature.store';
import { PEN_PICK_PX } from './pen-tool';
import { PEN_TEXTS as T } from './pen-texts';

/**
 * The Curvature tool on the canvas (prompt 043): clicks place points of a new path, or – on the
 * selected path – edit it (drag a point, add one on the path, Alt-click / double-click corner ↔
 * smooth, Backspace removes). Registers with `CanvasTools`.
 */
@Injectable({ providedIn: 'root' })
export class CurvatureTool implements CanvasTool {
  readonly id = 'curvature';
  private readonly store = inject(CurvatureStore);
  private readonly service = inject(CurvatureService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), this.files);
  private pressed = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.store.on();
  }

  stop(): void {
    this.store.toggle(false);
  }

  private tol(): number {
    return PEN_PICK_PX / Math.max(this.view.zoom(), 1e-6);
  }

  private point(e: ToolPointer): Point {
    const own = this.store.edit()?.anchors.map((a) => a.p) ?? this.store.points().map((p) => p.p);
    const pts = this.store.points();
    return this.snap.point(e, own, pts[pts.length - 1]?.p ?? null);
  }

  press(e: ToolPointer): void {
    const client = { x: e.clientX, y: e.clientY };
    const raw = this.snap.raw(e);
    if (!this.store.drawing() && !this.store.edit()) this.beginEdit();
    if (this.store.edit()) {
      const r = this.store.pressEdit(raw, client, this.tol(), e.altKey);
      if (r === 'changed') this.service.commitEdit();
      if (r !== 'outside') {
        this.pressed = true;
        return;
      }
      this.store.edit.set(null);
    }
    if (this.store.press(this.point(e), client, this.tol(), e.altKey) === 'closed') {
      void this.service.finish();
      return;
    }
    this.pressed = true;
  }

  move(e: ToolPointer): void {
    this.store.move(this.point(e), { x: e.clientX, y: e.clientY });
  }

  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.store.release()) this.service.commitEdit();
  }

  dblclick(e: ToolPointer): void {
    if (this.store.toggleAt(this.snap.raw(e), this.tol())) this.service.commitEdit();
  }

  leave(): void {
    this.store.hover.set(null);
    this.snap.clear();
  }

  escape(): boolean {
    if (this.store.points().length >= 2) {
      void this.service.finish();
      return true;
    }
    if (this.store.drawing()) {
      this.store.reset();
      return true;
    }
    if (!this.store.on()) return false;
    this.store.toggle(false);
    return true;
  }

  hint(): string {
    const h = this.store.edit()
      ? T.curvature.editing
      : this.store.drawing()
        ? T.curvature.drawing
        : T.curvature.start;
    return `${h} · ${T.escEnds}`;
  }

  reset(): void {
    this.store.reset();
  }

  /** The selected single path becomes the one being edited. */
  private beginEdit(): void {
    const store = this.files.store();
    const host = this.view.host;
    const refs = store?.selection() ?? [];
    if (!store || !host || refs.length !== 1) return;
    const el = store.document().node(refs[0]);
    if (!(el instanceof SVGGraphicsElement) || el.localName !== 'path') return;
    const path = singlePath(el.getAttribute('d') ?? '');
    const m = nodeToDocument(host, el);
    const toDoc = m ? fromDom(m) : null;
    const toLocal = toDoc ? invert(toDoc) : null;
    if (!path || !toDoc || !toLocal) return;
    this.store.startEdit({
      ref: refs[0],
      prefix: '',
      toLocal,
      anchors: mapAnchors(path.anchors, (q) => apply(toDoc, q)),
      closed: path.closed,
    });
  }
}
