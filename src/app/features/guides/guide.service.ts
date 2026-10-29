import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { AddService } from '../commands/add.service';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { CONSTRUCTION_ATTR } from '../construction/construction';
import { FilesService } from '../files/files.service';

/** A guide: horizontal (a y) or vertical (an x), document units. */
export type GuideAxis = 'horizontal' | 'vertical';

/** Marks a guide (a construction line across the canvas, prompt 056). */
export const GUIDE_ATTR = 'data-guide';
/** How far a guide reaches beyond the canvas on each side. */
const REACH = 4 * CANVAS_SIZE;

/** The markup of a guide at `at`, its ends mapped by `local` (document → parent space). */
export function guideMarkup(
  axis: GuideAxis,
  at: number,
  local: (p: { x: number; y: number }) => { x: number; y: number } = (p) => p,
): string {
  const [a, b] =
    axis === 'horizontal'
      ? [local({ x: -REACH, y: at }), local({ x: CANVAS_SIZE + REACH, y: at })]
      : [local({ x: at, y: -REACH }), local({ x: at, y: CANVAS_SIZE + REACH })];
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return (
    `<line xmlns="http://www.w3.org/2000/svg" ${GUIDE_ATTR}="${axis}" ${CONSTRUCTION_ATTR}="" ` +
    `opacity="0" stroke="#000" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`
  );
}

/**
 * Guides dragged out of the rulers (prompt 056): the top ruler gives a horizontal guide, the left
 * one a vertical guide; released over the canvas it becomes a construction line across the
 * canvas in the current layer (one undo step) – transparent in the file, not exported, and it
 * snaps like every construction line. Selected, it moves and deletes like any shape.
 */
@Injectable({ providedIn: 'root' })
export class GuideService {
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private readonly add = inject(AddService);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), this.files);
  /** The guide being dragged (document units). */
  readonly preview = signal<{ axis: GuideAxis; at: number } | null>(null);

  /** Starts dragging a guide out of a ruler. */
  startDrag(axis: GuideAxis, e: PointerEvent): void {
    if (e.button !== 0 || !this.files.store() || !this.view.host) return;
    e.preventDefault();
    const doc = e.target instanceof Element ? e.target.ownerDocument : document;
    const move = (ev: PointerEvent) => {
      const p = this.snap.point(ev);
      this.preview.set({ axis, at: axis === 'horizontal' ? p.y : p.x });
    };
    const up = (ev: PointerEvent) => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      const g = this.preview();
      this.preview.set(null);
      this.snap.clear();
      const r = this.view.host?.getBoundingClientRect();
      const over =
        !!r &&
        ev.clientX >= r.left &&
        ev.clientX <= r.right &&
        ev.clientY >= r.top &&
        ev.clientY <= r.bottom;
      if (g && over) void this.addGuide(g.axis, g.at);
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  /** Adds a guide (the AI's way too); the selection stays. */
  async addGuide(axis: GuideAxis, at: number): Promise<boolean> {
    const store = this.files.store();
    const before = store?.selection() ?? [];
    const ok = await this.add.insertBuilt('addGuide', undefined, (_c, local) => [
      guideMarkup(axis, at, local),
    ]);
    if (ok) this.files.store()?.selection.set([...before]);
    return ok;
  }

  /** Where a client point lies in document units (the rulers' own use). */
  toDoc(e: { clientX: number; clientY: number }) {
    return this.view.host ? clientToDocument(this.view.host, e) : null;
  }
}
