import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { AddService } from '../commands/add.service';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { CONSTRUCTION_ATTR } from '../construction/construction';
import { FilesService } from '../files/files.service';
import { CompositeCommand, RemoveNode, SetAttributes } from '../document/commands';
import { GUIDE_ATTR } from './guide-attr';
import { LOCK_ATTR } from '../lock/lock';

/** A guide: horizontal (a y) or vertical (an x), document units. */
export type GuideAxis = 'horizontal' | 'vertical';

export { GUIDE_ATTR } from './guide-attr';
/** How far a guide reaches beyond the canvas on each side. */
const REACH = 4 * CANVAS_SIZE;

/** The markup of a guide at `at`, its ends mapped by `local` (document → parent space). */
export function guideMarkup(
  axis: GuideAxis,
  at: number,
  local: (p: { x: number; y: number }) => { x: number; y: number } = (p) => p,
  locked = false,
): string {
  const [a, b] =
    axis === 'horizontal'
      ? [local({ x: -REACH, y: at }), local({ x: CANVAS_SIZE + REACH, y: at })]
      : [local({ x: at, y: -REACH }), local({ x: at, y: CANVAS_SIZE + REACH })];
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return (
    `<line xmlns="http://www.w3.org/2000/svg" ${GUIDE_ATTR}="${axis}" ${CONSTRUCTION_ATTR}="" ` +
    `opacity="0" stroke="#000" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"` +
    `${locked ? ` ${LOCK_ATTR}="true"` : ''}/>`
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
  /**
   * New guides are locked (prompt 066, default on): not hit, not caught by the marquee, not in
   * Select All – like every locked element (055). `guides.lock` switches all guides at once.
   */
  private readonly lockNew = signal(true);

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
      guideMarkup(axis, at, local, this.lockNew()),
    ]);
    if (ok) this.files.store()?.selection.set([...before]);
    return ok;
  }

  /** Every guide of the document. */
  all(): Element[] {
    const doc = this.files.store()?.document();
    if (!doc) return [];
    return [...doc.assets.values()].flatMap((a) =>
      a.svg ? Array.from(a.svg.root.querySelectorAll(`[${GUIDE_ATTR}]`)) : [],
    );
  }

  /** The guides are locked: all of them (none there: what new ones get). */
  locked(): boolean {
    this.files.store()?.revision();
    const all = this.all();
    return all.length ? all.every((g) => g.hasAttribute(LOCK_ATTR)) : this.lockNew();
  }

  /** Locks / unlocks every guide (one undo step) and the ones to come. */
  setLocked(on: boolean): boolean {
    this.lockNew.set(on);
    const store = this.files.store();
    if (!store) return true;
    const doc = store.document();
    const changes = this.all()
      .filter((g) => g.hasAttribute(LOCK_ATTR) !== on)
      .flatMap((g) => {
        const ref = doc.refOf(g);
        return ref ? [{ ref, name: LOCK_ATTR, value: on ? 'true' : null }] : [];
      });
    if (changes.length) store.execute(new SetAttributes(changes, on ? 'lock' : 'unlock'));
    // locked guides leave the selection like every locked node
    if (on) store.selection.update((s) => s.filter((r) => !doc.node(r)?.hasAttribute(GUIDE_ATTR)));
    return true;
  }

  /** Removes every guide (one undo step); `false` if there is none. */
  clear(): boolean {
    const store = this.files.store();
    const doc = store?.document();
    const refs = doc ? this.all().flatMap((g) => doc.refOf(g) ?? []) : [];
    if (!store || !refs.length) return false;
    store.execute(
      new CompositeCommand(
        'clearGuides',
        refs.map((r) => new RemoveNode(r)),
      ),
    );
    return true;
  }

  /** Where a client point lies in document units (the rulers' own use). */
  toDoc(e: { clientX: number; clientY: number }) {
    return this.view.host ? clientToDocument(this.view.host, e) : null;
  }
}
