import { inject, Injectable, signal } from '@angular/core';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { localBBox } from '../../shared/geometry/clip-geometry';
import {
  BoxEdit,
  boxEditMatrix,
  boxFrame,
  elementFrame,
  Frame,
} from '../../shared/geometry/box-frame';
import { fromDom } from '../../shared/geometry/matrix';
import { Anchor } from '../../shared/geometry/transform-ops';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { isDefinitionElement } from '../document/model/reorder-rules';
import { FilesService } from '../files/files.service';
import { deletableNodes } from '../hierarchy/edit-operations';
import { isLocked } from '../lock/lock';
import { TransformService } from '../transform/transform.service';

/** What the box head shows: the frame of the selection, and whether it may change. */
export interface BoxState {
  frame: Frame;
  locked: boolean;
}

/**
 * The box head of the properties panel (prompt 062): measures the selection with the browser
 * (`getBBox` + CTM, one element → its own rotated frame, several → the box around all) and turns
 * a typed value into one matrix in document space that `TransformService` puts in front of each
 * node's `transform` – the same way as the Transform dialog (053). Typing / dragging a field is a
 * live preview (one undo step on Enter / blur), Escape takes it back.
 */
@Injectable({ providedIn: 'root' })
export class BoxService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly transform = inject(TransformService);
  /** The measured state (refreshed after each render by the panel). */
  readonly state = signal<BoxState | null>(null);
  /** Reference point of X / Y, size and rotation (for the session). */
  readonly pivot = signal<Anchor>('tl');
  /** Constrain proportions of W / H. */
  readonly lock = signal(false);
  /** The frame when the field's gesture began: every live value is relative to it. */
  private start: Frame | null = null;

  /** Measures the selection now (needs layout); `null` without host or measurable nodes. */
  measure(): BoxState | null {
    const store = this.files.store();
    const host = this.view.host;
    if (!store || !host) return null;
    const els = deletableNodes(store.document(), store.selection()).filter(
      (el): el is SVGGraphicsElement =>
        !isDefinitionElement(el) && el instanceof SVGGraphicsElement,
    );
    if (!els.length) return null;
    const locked = els.some((el) => isLocked(el));
    if (els.length === 1) {
      const m = nodeToDocument(host, els[0]);
      const b = m ? localBBox(els[0]) : null;
      return m && b ? { frame: elementFrame(b, fromDom(m)), locked } : null;
    }
    const frames = els.flatMap((el) => {
      const m = nodeToDocument(host, el);
      const b = m ? localBBox(el) : null;
      return m && b ? [elementFrame(b, fromDom(m))] : [];
    });
    if (!frames.length) return null;
    // the axis-parallel box around every element's frame corners
    const pts = frames.flatMap((f) => {
      const c = Math.cos((f.rotation * Math.PI) / 180);
      const s = Math.sin((f.rotation * Math.PI) / 180);
      return [
        [0, 0],
        [f.width, 0],
        [0, f.height],
        [f.width, f.height],
      ].map(([u, v]) => ({ x: f.origin.x + u * c - v * s, y: f.origin.y + u * s + v * c }));
    });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      frame: boxFrame({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }),
      locked,
    };
  }

  refresh(): void {
    this.state.set(this.measure());
  }

  /** A live value of a field (typing, stepping, dragging). */
  preview(edit: BoxEdit): void {
    const st = this.start ? null : this.measure();
    if (!this.start) {
      if (!st || st.locked) return;
      this.start = st.frame;
    }
    const m = boxEditMatrix(this.start, this.pivot(), edit, this.lock());
    if (m) this.transform.previewMatrix(m);
    else if (this.transform.busy) this.transform.cancel();
  }

  commit(): void {
    this.start = null;
    if (this.transform.busy) this.transform.commit();
    this.refresh();
  }

  cancel(): void {
    this.start = null;
    if (this.transform.busy) this.transform.cancel();
    this.refresh();
  }

  /** At once, one undo step (buttons, the AI): `false` = nothing changed. */
  apply(edit: BoxEdit, pivot: Anchor = this.pivot(), lock = this.lock()): boolean {
    const st = this.measure();
    if (!st || st.locked) return false;
    const m = boxEditMatrix(st.frame, pivot, edit, lock);
    const done = m ? this.transform.applyMatrix(m) : false;
    this.refresh();
    return done;
  }

  /** There is something to measure and change. */
  canApply(): boolean {
    const st = this.measure();
    return !!st && !st.locked;
  }
}
