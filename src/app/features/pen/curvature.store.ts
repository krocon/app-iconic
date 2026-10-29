import { computed, Injectable, signal } from '@angular/core';
import {
  curvatureSpline,
  CurvePoint,
  curveAnchor,
  insertAnchor,
  moveAnchor,
  nearestOnSegment,
} from '../../shared/geometry/pen/curvature';
import { PenAnchor } from '../../shared/geometry/pen/pen-path';
import { Point } from '../../shared/geometry/view-transform';
import { PEN_DRAG_PX, PenContinuation } from './pen.store';

/** A selected path the Curvature tool edits (prompt 043). */
export interface CurvatureEdit extends PenContinuation {
  anchors: readonly PenAnchor[];
  closed: boolean;
  /** The anchor touched last (Backspace removes it). */
  current: number | null;
}

interface Drag {
  index: number;
  client: { x: number; y: number };
  moved: boolean;
  /** Edit mode: the anchors when the drag began. */
  base: readonly PenAnchor[] | null;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The Curvature tool of this window (prompt 043; Marc's VectorCraft `draw2/curvature.rs`): the
 * points of a new path (the curve runs smoothly through them) or the anchors of the selected path
 * being edited. Root-provided; `CurvatureTool` feeds snapped points, `CurvatureService` writes.
 */
@Injectable({ providedIn: 'root' })
export class CurvatureStore {
  readonly on = signal(false);
  readonly points = signal<readonly CurvePoint[]>([]);
  readonly closed = signal(false);
  readonly hover = signal<Point | null>(null);
  readonly edit = signal<CurvatureEdit | null>(null);
  private drag: Drag | null = null;

  readonly drawing = computed(() => this.points().length > 0);
  /** What the overlay draws (document units). */
  readonly preview = computed(
    (): { anchors: readonly PenAnchor[]; closed: boolean; placed: number } => {
      const e = this.edit();
      if (e) return { anchors: e.anchors, closed: e.closed, placed: e.anchors.length };
      const pts = this.points();
      const hover = this.hover();
      const rubber = !this.closed() && hover && pts.length && !this.drag;
      const all = rubber ? [...pts, { p: hover }] : pts;
      return {
        anchors: curvatureSpline(all, this.closed()),
        closed: this.closed(),
        placed: pts.length,
      };
    },
  );

  toggle(on = !this.on()): void {
    this.reset();
    this.on.set(on);
  }

  reset(): void {
    this.points.set([]);
    this.closed.set(false);
    this.hover.set(null);
    this.edit.set(null);
    this.drag = null;
  }

  dragging(): boolean {
    return this.drag !== null;
  }

  /** The path drawn (`null` with fewer than two points). */
  result(): { anchors: PenAnchor[]; closed: boolean } | null {
    const pts = this.points();
    return pts.length >= 2
      ? { anchors: curvatureSpline(pts, this.closed()), closed: this.closed() }
      : null;
  }

  /** Begins editing a selected path. */
  startEdit(e: Omit<CurvatureEdit, 'current'>): void {
    this.points.set([]);
    this.edit.set({ ...e, current: null });
  }

  /**
   * A press while drawing: closes on the first point (`'closed'`), toggles a point's corner with
   * Alt, grabs a point to drag, else adds one (Alt: a corner).
   */
  press(p: Point, client: { x: number; y: number }, tol: number, alt: boolean): 'closed' | null {
    const pts = this.points();
    if (pts.length >= 3 && dist(pts[0].p, p) <= tol && !alt) {
      this.closed.set(true);
      return 'closed';
    }
    const i = pts.findIndex((x) => dist(x.p, p) <= tol);
    if (i >= 0) {
      if (alt) this.toggleCorner(i);
      else this.drag = { index: i, client, moved: false, base: null };
      return null;
    }
    this.points.set([...pts, { p, corner: alt }]);
    this.drag = { index: pts.length, client, moved: false, base: null };
    return null;
  }

  /**
   * A press while editing: on an anchor (Alt: corner ↔ smooth, else grab it), on the path (a
   * smooth point without changing the shape, grabbed); `'changed'` when the path changed,
   * `'outside'` when it hit nothing.
   */
  pressEdit(
    p: Point,
    client: { x: number; y: number },
    tol: number,
    alt: boolean,
  ): 'changed' | 'grabbed' | 'outside' {
    const e = this.edit();
    if (!e) return 'outside';
    const i = e.anchors.findIndex((a) => dist(a.p, p) <= tol);
    if (i >= 0) {
      if (alt) {
        const smooth = !!(e.anchors[i].hin || e.anchors[i].hout);
        this.edit.set({ ...e, anchors: curveAnchor(e.anchors, i, e.closed, !smooth), current: i });
        return 'changed';
      }
      this.edit.set({ ...e, current: i });
      this.drag = { index: i, client, moved: false, base: e.anchors };
      return 'grabbed';
    }
    const segs = e.closed ? e.anchors.length : e.anchors.length - 1;
    let best: { i: number; t: number; d: number } | null = null;
    for (let s = 0; s < segs; s++) {
      const n = nearestOnSegment(e.anchors, s, p);
      if (n && n.d <= tol && (!best || n.d < best.d)) best = { i: s, ...n };
    }
    if (!best) return 'outside';
    const anchors = insertAnchor(e.anchors, best.i, best.t);
    this.edit.set({ ...e, anchors, current: best.i + 1 });
    this.drag = { index: best.i + 1, client, moved: false, base: anchors };
    return 'changed';
  }

  /** The pointer moved: the rubber band, or the point being dragged. */
  move(p: Point, client: { x: number; y: number }): void {
    this.hover.set(p);
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(client.x - d.client.x, client.y - d.client.y) < PEN_DRAG_PX) return;
    d.moved = true;
    const e = this.edit();
    if (e && d.base) {
      this.edit.set({ ...e, anchors: moveAnchor(d.base, d.index, p, e.closed) });
    } else {
      this.points.update((pts) => pts.map((x, j) => (j === d.index ? { ...x, p } : x)));
    }
  }

  /** Released: `true` when an edit drag moved a point (to be written). */
  release(): boolean {
    const d = this.drag;
    this.drag = null;
    return !!d?.moved && !!this.edit();
  }

  /** Double click: a point's corner ↔ smooth; `true` when an edited path changed. */
  toggleAt(p: Point, tol: number): boolean {
    const e = this.edit();
    if (e) {
      const i = e.anchors.findIndex((a) => dist(a.p, p) <= tol);
      if (i < 0) return false;
      const smooth = !!(e.anchors[i].hin || e.anchors[i].hout);
      this.edit.set({ ...e, anchors: curveAnchor(e.anchors, i, e.closed, !smooth), current: i });
      return true;
    }
    const i = this.points().findIndex((x) => dist(x.p, p) <= tol);
    if (i >= 0) this.toggleCorner(i);
    return false;
  }

  /** Backspace: the last point drawn, or the current anchor of the edited path; `true` = edited. */
  remove(): boolean {
    const e = this.edit();
    if (!e) {
      this.points.update((pts) => pts.slice(0, -1));
      return false;
    }
    const i = e.current;
    if (i === null || e.anchors.length <= (e.closed ? 3 : 2)) return false;
    let anchors = e.anchors.filter((_, j) => j !== i);
    // the neighbours re-curve where they are smooth
    const n = anchors.length;
    for (const j of [i - 1, i]) {
      const k = e.closed ? (j + n) % n : j;
      const a = anchors[k];
      if (a && (a.hin || a.hout)) anchors = curveAnchor(anchors, k, e.closed, true);
    }
    this.edit.set({ ...e, anchors, current: null });
    return true;
  }

  private toggleCorner(i: number): void {
    this.points.update((pts) => pts.map((x, j) => (j === i ? { ...x, corner: !x.corner } : x)));
  }
}
