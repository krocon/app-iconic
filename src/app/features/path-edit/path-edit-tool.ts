import { computed, inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import {
  addAnchor,
  convertAnchor,
  cutAt,
  eraseAlong,
  hitAnchor,
  hitSegment,
  pullHandles,
  removeAnchor,
  smoothAlong,
} from '../../shared/geometry/pen/path-model';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { PathEditService, PathTarget } from './path-edit.service';
import { PATH_EDIT_TEXTS as T } from './path-edit-texts';

export type PathMode =
  'addAnchor' | 'deleteAnchor' | 'anchorPoint' | 'scissors' | 'smooth' | 'eraser';
export const PATH_MODES: readonly PathMode[] = [
  'addAnchor',
  'deleteAnchor',
  'anchorPoint',
  'scissors',
  'smooth',
  'eraser',
];

/** Pick distance of points and paths; the brush of Smooth / Path Eraser (screen px). */
export const PATH_PICK_PX = 8;
export const BRUSH_PX = 8;

/**
 * The path tools on the canvas (prompt 046; VectorCraft's anchor tools, Scissors, Smooth, Path
 * Eraser): they work on the selected paths and shapes (a shape becomes a path on its first edit),
 * every edit one undo step. Registers with `CanvasTools`.
 */
@Injectable({ providedIn: 'root' })
export class PathEditTool implements CanvasTool {
  readonly id = 'pathEdit';
  readonly mode = signal<PathMode | null>(null);
  /** The brush stroke of Smooth / Path Eraser (document units). */
  readonly stroke = signal<readonly Point[]>([]);
  private readonly service = inject(PathEditService);
  private readonly view = inject(CanvasViewStore);
  private readonly edit = inject(CanvasEditStore);
  private readonly files = inject(FilesService);
  private brushing = false;

  /** The anchors of the selected paths (the overlay shows them). */
  readonly anchors = computed(() => {
    if (!this.mode()) return [];
    this.files.store()?.revision();
    this.files.store()?.selection();
    this.view.zoom();
    return this.service
      .targets()
      .flatMap((t) => t.subpaths.flatMap((s) => s.anchors.map((a) => a.p)));
  });

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    this.mode.set(null);
    this.stroke.set([]);
  }

  toggle(mode: PathMode): void {
    this.stroke.set([]);
    this.mode.set(this.mode() === mode ? null : mode);
  }

  private tol(px = PATH_PICK_PX): number {
    return px / Math.max(this.view.zoom(), 1e-6);
  }

  private doc(e: ToolPointer): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  /** The selected target with the nearest point / segment under `p`. */
  private hit(p: Point, what: 'anchor' | 'segment') {
    let best: { t: PathTarget; s: number; i: number; tt: number; d: number } | null = null;
    for (const t of this.service.targets()) {
      const h =
        what === 'anchor'
          ? hitAnchor(t.subpaths, p, this.tol())
          : hitSegment(t.subpaths, p, this.tol());
      if (h && (!best || h.d < best.d))
        best = { t, s: h.s, i: h.i, tt: 't' in h ? (h.t as number) : 0, d: h.d };
    }
    return best;
  }

  press(e: ToolPointer): void {
    const mode = this.mode();
    const p = this.doc(e);
    if (!this.service.targets().length) {
      this.files.notice.set(T.noPath);
      return;
    }
    switch (mode) {
      case 'addAnchor': {
        const h = this.hit(p, 'segment');
        if (h) this.service.write(h.t, addAnchor(h.t.subpaths, h.s, h.i, h.tt));
        return;
      }
      case 'deleteAnchor': {
        const h = this.hit(p, 'anchor');
        if (h) this.service.write(h.t, removeAnchor(h.t.subpaths, h.s, h.i));
        return;
      }
      case 'scissors': {
        let h = this.hit(p, 'anchor');
        let subpaths = h?.t.subpaths;
        if (!h) {
          const seg = this.hit(p, 'segment');
          if (!seg) return;
          subpaths = addAnchor(seg.t.subpaths, seg.s, seg.i, seg.tt);
          h = { ...seg, i: seg.i + 1 };
        }
        const { keep, off } = cutAt(subpaths!, h.s, h.i);
        const extra = off ? this.service.sibling(h.t, [off]) : null;
        this.service.write(h.t, keep, extra ? [extra] : []);
        return;
      }
      case 'anchorPoint':
        this.pressAnchorPoint(e, p);
        return;
      case 'smooth':
      case 'eraser':
        this.brushing = true;
        this.stroke.set([p]);
        return;
    }
  }

  /** Anchor Point: a click toggles smooth ↔ corner, a drag pulls new symmetric handles. */
  private pressAnchorPoint(e: ToolPointer, p: Point): void {
    const h = this.hit(p, 'anchor');
    const store = this.files.store();
    const host = this.view.host;
    if (!h || !store || !host) return;
    const a = h.t.subpaths[h.s].anchors[h.i];
    this.edit.gesture.start(
      {
        label: 'editPath',
        update: (q) => this.service.command(h.t, pullHandles(h.t.subpaths, h.s, h.i, q)),
        click: () => {
          const smooth = !!(a.hin || a.hout);
          this.service.write(h.t, convertAnchor(h.t.subpaths, h.s, h.i, !smooth));
        },
        end: (done) => {
          if (done && h.t.el.localName !== 'path') store.selection.set(store.selection());
        },
      },
      store,
      {
        pointerId: e.pointerId ?? 0,
        clientX: e.clientX,
        clientY: e.clientY,
        altKey: e.altKey,
        shiftKey: !!e.shiftKey,
        ctrlKey: !!e.ctrlKey,
        metaKey: !!e.metaKey,
      },
      (c) => clientToDocument(host, c),
    );
  }

  move(e: ToolPointer): void {
    if (this.brushing) this.stroke.update((s) => [...s, this.doc(e)]);
    this.edit.gesture.move({
      pointerId: e.pointerId ?? 0,
      clientX: e.clientX,
      clientY: e.clientY,
      altKey: e.altKey,
      shiftKey: !!e.shiftKey,
      ctrlKey: !!e.ctrlKey,
      metaKey: !!e.metaKey,
    });
  }

  release(e: ToolPointer): void {
    this.edit.gesture.up({
      pointerId: e.pointerId ?? 0,
      altKey: e.altKey,
      shiftKey: !!e.shiftKey,
      ctrlKey: !!e.ctrlKey,
      metaKey: !!e.metaKey,
    });
    if (!this.brushing) return;
    this.brushing = false;
    const stroke = this.stroke();
    this.stroke.set([]);
    const r = this.tol(BRUSH_PX);
    for (const t of this.service.targets()) {
      const next =
        this.mode() === 'eraser'
          ? eraseAlong(t.subpaths, stroke, r)
          : smoothAlong(t.subpaths, stroke, r);
      if (JSON.stringify(next) !== JSON.stringify(t.subpaths)) this.service.write(t, next);
    }
  }

  leave(): void {
    /* the brush stays until the release */
  }

  escape(): boolean {
    if (!this.mode()) return false;
    this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    return m ? `${T.hints[m]} · ${T.escEnds}` : null;
  }

  reset(): void {
    this.stop();
  }
}
