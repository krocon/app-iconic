import { Injectable, signal } from '@angular/core';
import { acceptSample, FREEHAND_DEFAULTS, shouldAutoClose } from '../../shared/geometry/freehand';
import { Point } from '../../shared/geometry/view-transform';

/** A finished stroke: points in document units, open or closed. */
export interface FreehandStroke {
  points: Point[];
  closed: boolean;
}

/** Template `addFreeHandPath`: stroke width 8. */
export const FREEHAND_STROKE_WIDTH = 8;

/**
 * The freehand tool of this window (design 013 E2–E5): on/off, the options of the toolbar
 * (closed, smoothing = RDP epsilon, stroke width) and the stroke being drawn (document units).
 * Root-provided like the `CanvasEditStore` (one canvas per window). Pure state – the canvas feeds
 * it pointer positions, `FreehandService` inserts the result.
 */
@Injectable({ providedIn: 'root' })
export class FreehandStore {
  readonly active = signal(false);
  readonly drawing = signal(false);
  /** The stroke so far (document units), for the live preview. */
  readonly points = signal<readonly Point[]>([]);
  readonly closed = signal(false);
  readonly epsilon = signal<number>(FREEHAND_DEFAULTS.epsilon);
  readonly strokeWidth = signal(FREEHAND_STROKE_WIDTH);
  private last: { p: Point; t: number } | null = null;

  /** Switches the tool on/off (`add.freehand`); a running stroke is dropped. */
  toggle(on = !this.active()): void {
    this.cancel();
    this.active.set(on);
  }

  begin(p: Point, t: number): void {
    if (!this.active()) return;
    this.points.set([p]);
    this.last = { p, t };
    this.drawing.set(true);
  }

  /** A pointer position while drawing; kept per design 013 E2 (`pxPerUnit` = zoom). */
  sample(p: Point, t: number, pxPerUnit: number): void {
    if (!this.drawing()) return;
    if (this.points().length >= FREEHAND_DEFAULTS.maxPoints) return;
    if (!acceptSample(this.last, p, t, pxPerUnit)) return;
    this.points.update((ps) => [...ps, p]);
    this.last = { p, t };
  }

  /**
   * The pointer was released at `p`: the stroke (auto-closed near its start, design 013 E4) or
   * `null` for a click; the tool stays on.
   */
  finish(p: Point | null, pxPerUnit: number): FreehandStroke | null {
    if (!this.drawing()) return null;
    const pts = [...this.points()];
    const last = pts[pts.length - 1];
    if (p && last && Math.hypot(p.x - last.x, p.y - last.y) * pxPerUnit >= 0.5) pts.push(p);
    this.cancel();
    if (pts.length < 2) return null;
    return { points: pts, closed: this.closed() || shouldAutoClose(pts, pxPerUnit) };
  }

  /** Drops the running stroke; `true` if there was one. */
  cancel(): boolean {
    const was = this.drawing();
    this.drawing.set(false);
    this.points.set([]);
    this.last = null;
    return was;
  }

  /** Esc (design 013 E3): the stroke first, then the tool; `false` = nothing to do. */
  escape(): boolean {
    if (this.cancel()) return true;
    if (!this.active()) return false;
    this.active.set(false);
    return true;
  }
}
