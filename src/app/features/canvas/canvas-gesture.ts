import { Point } from '../../shared/geometry/view-transform';
import { DocCommand } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { UndoLabel } from '../document/undo/undo-texts';

/** Pointer movement before a press becomes a drag (screen px). */
export const DRAG_THRESHOLD_PX = 3;

export interface Modifiers {
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** What one drag does (handle, move, box, marquee …). */
export interface DragOp {
  /** Undo label; without one the drag changes no document (marquee). */
  label?: UndoLabel;
  /** The change for the pointer at document point `p` (from the snapshot of the start). */
  update(p: Point, mods: Modifiers): DocCommand | null;
  /** Pressed and released without moving. */
  click?(mods: Modifiers): void;
  /** After commit or cancel (`committed` = the drag happened and was kept). */
  end?(committed: boolean): void;
}

interface Running {
  op: DragOp;
  store: DocumentStore;
  pointerId: number;
  start: { x: number; y: number };
  last: { clientX: number; clientY: number } & Modifiers;
  active: boolean;
  /** A move since the last update. */
  pending: boolean;
  toDoc: (c: { clientX: number; clientY: number }) => Point;
}

/**
 * A drag as an undo gesture (design 007 E9): from 3 px movement `store.begin(label)`, per frame
 * (requestAnimationFrame) ONE `update` with the result for the latest pointer position, `commit`
 * on release, `cancel` on Escape / pointercancel (the start state comes back). A press without
 * movement is a click. Pure enough for Vitest (the frame scheduler is injected).
 */
export class GestureController {
  private run: Running | null = null;
  private frame = 0;

  constructor(
    private readonly schedule: (fn: () => void) => number = (fn) => requestAnimationFrame(fn),
    private readonly unschedule: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  get busy(): boolean {
    return this.run !== null;
  }

  /** A drag happens (past the threshold). */
  get dragging(): boolean {
    return !!this.run?.active;
  }

  start(
    op: DragOp,
    store: DocumentStore,
    e: { pointerId: number; clientX: number; clientY: number } & Modifiers,
    toDoc: Running['toDoc'],
  ): void {
    this.cancel();
    this.run = {
      op,
      store,
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      last: { ...mods(e), clientX: e.clientX, clientY: e.clientY },
      active: false,
      pending: false,
      toDoc,
    };
  }

  move(e: { pointerId: number; clientX: number; clientY: number } & Modifiers): void {
    const r = this.run;
    if (!r || r.pointerId !== e.pointerId) return;
    r.last = { ...mods(e), clientX: e.clientX, clientY: e.clientY };
    r.pending = true;
    if (!r.active) {
      if (Math.hypot(e.clientX - r.start.x, e.clientY - r.start.y) < DRAG_THRESHOLD_PX) return;
      r.active = true;
      if (r.op.label) r.store.begin(r.op.label);
    }
    if (!this.frame) this.frame = this.schedule(() => this.flush());
  }

  up(e: { pointerId: number } & Modifiers): void {
    const r = this.run;
    if (!r || r.pointerId !== e.pointerId) return;
    if (!r.active) {
      this.run = null;
      r.op.click?.(mods(e));
      r.op.end?.(false);
      return;
    }
    this.flush();
    this.run = null;
    if (r.op.label) r.store.commit();
    r.op.end?.(true);
  }

  /** Escape / pointercancel: everything back. `true` if something was running. */
  cancel(): boolean {
    const r = this.run;
    if (!r) return false;
    this.stopFrame();
    this.run = null;
    if (r.active && r.op.label) r.store.cancel();
    r.op.end?.(false);
    return true;
  }

  private stopFrame(): void {
    if (this.frame) this.unschedule(this.frame);
    this.frame = 0;
  }

  private flush(): void {
    this.stopFrame();
    const r = this.run;
    if (!r?.active || !r.pending) return;
    r.pending = false;
    const cmd = r.op.update(r.toDoc(r.last), r.last);
    if (cmd) r.store.update(cmd);
  }
}

function mods(e: Modifiers): Modifiers {
  return { altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey };
}
