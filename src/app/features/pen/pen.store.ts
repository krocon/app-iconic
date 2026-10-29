import { computed, Injectable, signal } from '@angular/core';
import { Matrix } from '../../shared/geometry/matrix';
import { constrain45, dragHandles, PenAnchor } from '../../shared/geometry/pen/pen-path';
import { Point } from '../../shared/geometry/view-transform';
import { NodeRef } from '../document/icon-document';

/** Screen pixels the pointer moves after a press before it pulls handles (VectorCraft: 3). */
export const PEN_DRAG_PX = 3;

/** A selected open path the pen goes on with (prompt 042). */
export interface PenContinuation {
  ref: NodeRef;
  /** The path data before its last subpath, as written. */
  prefix: string;
  /** Document → the path's user space. */
  toLocal: Matrix;
}

interface Drag {
  index: number;
  client: { x: number; y: number };
  moved: boolean;
  /** Pressed on the last anchor: only a new outgoing handle. */
  outOnly: boolean;
  closing: boolean;
  last: Point;
}

/**
 * The pen of this window (prompt 042; behaviour of Marc's VectorCraft `pen.rs`): the anchors
 * placed, the one whose handles a drag shapes, the pointer for the rubber band. Root-provided
 * like the sketch tools (one canvas per window). Pure state – `PenTool` feeds snapped points,
 * `PenService` inserts.
 */
@Injectable({ providedIn: 'root' })
export class PenStore {
  readonly on = signal(false);
  readonly anchors = signal<readonly PenAnchor[]>([]);
  readonly closed = signal(false);
  /** The pointer (rubber band), `null` off the canvas. */
  readonly hover = signal<Point | null>(null);
  readonly continuing = signal<PenContinuation | null>(null);
  private drag: Drag | null = null;
  private spaceMove = false;

  readonly drawing = computed(() => this.anchors().length > 0);
  /** What the overlay draws: the anchors and the rubber band to the pointer (document units). */
  readonly preview = computed((): { anchors: readonly PenAnchor[]; closed: boolean } => {
    const anchors = this.anchors();
    const hover = this.hover();
    const rubber = !this.closed() && hover && anchors.length && !this.drag;
    return { anchors: rubber ? [...anchors, { p: hover }] : anchors, closed: this.closed() };
  });

  toggle(on = !this.on()): void {
    this.reset();
    this.on.set(on);
  }

  reset(): void {
    this.anchors.set([]);
    this.closed.set(false);
    this.hover.set(null);
    this.continuing.set(null);
    this.drag = null;
    this.spaceMove = false;
  }

  dragging(): boolean {
    return this.drag !== null;
  }

  setSpaceMove(on: boolean): void {
    this.spaceMove = on;
  }

  /** Goes on with an open path: its anchors in document units (the end to go on from last). */
  startFrom(anchors: readonly PenAnchor[], c: PenContinuation): void {
    this.anchors.set(anchors);
    this.continuing.set(c);
  }

  /**
   * A press at `p` (document units, snapped; `tol` = pick distance): closes on the first anchor,
   * retracts the last one's handle on it, else adds an anchor (Shift: 45° from the last).
   */
  press(p: Point, client: { x: number; y: number }, tol: number, shift = false): void {
    const list = this.anchors();
    const last = list[list.length - 1];
    const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= tol;
    if (list.length >= 2 && near(list[0].p)) {
      this.closed.set(true);
      this.drag = { index: 0, client, moved: false, outOnly: false, closing: true, last: p };
      return;
    }
    if (last && near(last.p)) {
      this.update(list.length - 1, { ...last, hout: null });
      this.drag = {
        index: list.length - 1,
        client,
        moved: false,
        outOnly: true,
        closing: false,
        last: p,
      };
      return;
    }
    const q = shift && last ? constrain45(last.p, p) : p;
    this.anchors.set([...list, { p: q, hin: null, hout: null }]);
    this.drag = {
      index: list.length,
      client,
      moved: false,
      outOnly: false,
      closing: false,
      last: q,
    };
  }

  /** The pointer moved: the rubber band, or the handles of the anchor being dragged out. */
  move(p: Point, client: { x: number; y: number }, mods: { alt?: boolean; shift?: boolean }): void {
    this.hover.set(p);
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(client.x - d.client.x, client.y - d.client.y) < PEN_DRAG_PX) return;
    d.moved = true;
    const a = this.anchors()[d.index];
    if (!a) return;
    if (this.spaceMove) {
      // Space held: the anchor moves, handles and all
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      const sh = (q: Point | null | undefined) => (q ? { x: q.x + dx, y: q.y + dy } : (q ?? null));
      this.update(d.index, { p: sh(a.p)!, hin: sh(a.hin), hout: sh(a.hout) });
    } else {
      const to = mods.shift ? constrain45(a.p, p) : p;
      this.update(d.index, d.outOnly ? { ...a, hout: to } : dragHandles(a, to, !!mods.alt));
    }
    d.last = p;
  }

  /** Released: `true` when the press closed the path (it is finished). */
  release(): boolean {
    const d = this.drag;
    this.drag = null;
    return !!d?.closing;
  }

  /** The path as it stands (`null` with fewer than two anchors). */
  result(): {
    anchors: readonly PenAnchor[];
    closed: boolean;
    continuing: PenContinuation | null;
  } | null {
    const anchors = this.anchors();
    if (anchors.length < 2) return null;
    return { anchors, closed: this.closed(), continuing: this.continuing() };
  }

  private update(i: number, a: PenAnchor): void {
    this.anchors.update((list) => list.map((x, j) => (j === i ? a : x)));
  }
}
