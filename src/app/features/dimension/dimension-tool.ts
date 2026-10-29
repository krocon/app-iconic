import { inject, Injectable, signal } from '@angular/core';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { collectSketchTargets, nearestTarget, SketchTarget } from '../sketch/sketch-targets';
import { DimensionInput } from './dimension-markup';
import { DimensionService } from './dimension.service';
import { DIMENSION_TEXTS as T } from './dimension-texts';

/** Pick distance of edges and circles; a press counts as a drag beyond this (screen px). */
export const DIMENSION_PICK_PX = 8;
const DRAG_PX = 4;

/** What the dimension measures, before it is placed (the placing point comes last). */
export type Pending =
  | { kind: 'linear'; a: Point; b: Point }
  | { kind: 'radial'; c: Point; r: number }
  | { kind: 'angle'; v: Point; p1: Point; p2: Point };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The Dimension tool (prompt 048; VectorCraft `tools/src/dimension.rs`): hover an edge (linear),
 * a corner of two edges (angle) or a circle (radius, ⇧ diameter) and drag out – the release
 * places it; a click picks it and the next click places it; clicks on two points measure between
 * them. Points snap like the drawing tools. Every dimension one undo step.
 */
@Injectable({ providedIn: 'root' })
export class DimensionTool implements CanvasTool {
  readonly id = 'dimension';
  readonly on = signal(false);
  readonly hover = signal<SketchTarget | null>(null);
  readonly pending = signal<Pending | null>(null);
  readonly picks = signal<readonly Point[]>([]);
  /** Where the dimension would be placed now; Shift: diameter. */
  readonly at = signal<Point | null>(null);
  readonly diameter = signal(false);
  private readonly service = inject(DimensionService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), this.files);
  private targets: { revision: number; list: SketchTarget[] } | null = null;
  private press0: { client: Point; doc: Point; pending: Pending | null } | null = null;
  private dragging = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.on();
  }

  stop(): void {
    this.on.set(false);
    this.clear();
  }

  toggle(): void {
    if (this.on()) this.stop();
    else this.on.set(true);
  }

  private clear(): void {
    this.hover.set(null);
    this.pending.set(null);
    this.picks.set([]);
    this.at.set(null);
    this.press0 = null;
    this.dragging = false;
    this.snap.clear();
  }

  private tol(): number {
    return DIMENSION_PICK_PX / Math.max(this.view.zoom(), 1e-6);
  }

  private list(): SketchTarget[] {
    const revision = this.files.store()?.revision() ?? -1;
    if (this.targets?.revision !== revision) {
      const t = collectSketchTargets(this.view.layers, this.view.host);
      this.targets = { revision, list: t.targets };
    }
    return this.targets.list;
  }

  /** What a press at `p` on `t` measures: a corner near an end of an edge, else the edge / circle. */
  private pendingOf(t: SketchTarget, p: Point): Pending {
    if (t.draw.kind === 'circle') return { kind: 'radial', c: t.draw.c, r: t.draw.r };
    const { a, b } = t.draw;
    const tol = this.tol() * 1.5;
    for (const [v, far] of [
      [a, b],
      [b, a],
    ] as const) {
      if (dist(p, v) > tol) continue;
      const other = this.list().find(
        (o) =>
          o !== t &&
          o.draw.kind === 'segment' &&
          (dist(o.draw.a, v) < 1e-6 || dist(o.draw.b, v) < 1e-6),
      );
      if (other && other.draw.kind === 'segment') {
        const p2 = dist(other.draw.a, v) < 1e-6 ? other.draw.b : other.draw.a;
        return { kind: 'angle', v, p1: far, p2 };
      }
    }
    return { kind: 'linear', a, b };
  }

  input(p: Pending, at: Point, diameter: boolean): DimensionInput {
    switch (p.kind) {
      case 'linear':
        return { kind: 'linear', a: p.a, b: p.b, at };
      case 'radial':
        return { kind: diameter ? 'diameter' : 'radius', c: p.c, r: p.r, at };
      case 'angle':
        return { kind: 'angle', v: p.v, p1: p.p1, p2: p.p2, at };
    }
  }

  press(e: ToolPointer): void {
    const doc = this.snap.raw(e);
    const pending = this.pending();
    if (pending) {
      void this.place(pending, this.at() ?? doc, !!e.shiftKey);
      return;
    }
    const t = nearestTarget(this.list(), doc, this.tol());
    const point = this.snap.point(e, this.picks());
    this.press0 = {
      client: { x: e.clientX, y: e.clientY },
      doc: t ? doc : point,
      pending: t ? this.pendingOf(t, doc) : null,
    };
  }

  move(e: ToolPointer): void {
    const doc = this.snap.raw(e);
    this.diameter.set(!!e.shiftKey);
    const p0 = this.press0;
    if (
      p0 &&
      !this.dragging &&
      Math.hypot(e.clientX - p0.client.x, e.clientY - p0.client.y) > DRAG_PX &&
      p0.pending
    ) {
      this.dragging = true;
      this.pending.set(p0.pending);
    }
    if (this.pending()) {
      this.at.set(doc);
      this.hover.set(null);
      return;
    }
    const picks = this.picks();
    this.at.set(picks.length ? this.snap.point(e, picks, picks[picks.length - 1]) : null);
    this.hover.set(picks.length ? null : nearestTarget(this.list(), doc, this.tol()));
  }

  release(e: ToolPointer): void {
    const p0 = this.press0;
    this.press0 = null;
    if (!p0) return;
    const pending = this.pending();
    if (this.dragging && pending) {
      this.dragging = false;
      void this.place(pending, this.snap.raw(e), !!e.shiftKey);
      return;
    }
    if (p0.pending) {
      // a click picks what is under it; the next click places
      this.pending.set(p0.pending);
      this.at.set(p0.doc);
      return;
    }
    const picks = [...this.picks(), p0.doc];
    if (picks.length === 2) {
      this.picks.set([]);
      this.pending.set({ kind: 'linear', a: picks[0], b: picks[1] });
      this.at.set(picks[1]);
    } else this.picks.set(picks);
  }

  private async place(p: Pending, at: Point, diameter: boolean): Promise<void> {
    this.clear();
    await this.service.insert(this.input(p, at, diameter));
  }

  leave(): void {
    this.hover.set(null);
  }

  escape(): boolean {
    if (!this.on()) return false;
    if (this.pending() || this.picks().length) this.clear();
    else this.stop();
    return true;
  }

  hint(): string {
    const h = this.pending()
      ? T.dimension.place
      : this.picks().length
        ? T.dimension.second
        : T.dimension.start;
    return `${h} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
