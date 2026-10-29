import { inject, Injectable, signal } from '@angular/core';
import { formatValue, measure } from '../../shared/geometry/dimension';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { DIMENSION_TEXTS as T } from './dimension-texts';

/**
 * The Measure tool (prompt 048; VectorCraft `xform/measure.rs`): a drag between two snapped
 * points shows distance, angle and dx/dy in the status line and on the canvas – nothing goes
 * into the document. The last measurement stays until the next drag or Esc.
 */
@Injectable({ providedIn: 'root' })
export class MeasureTool implements CanvasTool {
  readonly id = 'measure';
  readonly on = signal(false);
  readonly line = signal<{ a: Point; b: Point } | null>(null);
  private readonly view = inject(CanvasViewStore);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), inject(FilesService));
  private dragging = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.on();
  }

  stop(): void {
    this.on.set(false);
    this.line.set(null);
    this.dragging = false;
    this.snap.clear();
  }

  toggle(): void {
    if (this.on()) this.stop();
    else this.on.set(true);
  }

  press(e: ToolPointer): void {
    const a = this.snap.point(e);
    this.line.set({ a, b: a });
    this.dragging = true;
  }

  move(e: ToolPointer): void {
    const l = this.line();
    if (!this.dragging || !l) {
      this.snap.point(e);
      return;
    }
    this.line.set({ a: l.a, b: this.snap.point(e, [], l.a) });
  }

  release(): void {
    this.dragging = false;
    this.snap.clear();
  }

  leave(): void {
    if (!this.dragging) this.snap.clear();
  }

  escape(): boolean {
    if (!this.on()) return false;
    if (this.line()) this.line.set(null);
    else this.stop();
    return true;
  }

  /** The readout: distance, angle and dx/dy of the last measurement. */
  readout(): string | null {
    const l = this.line();
    if (!l) return null;
    const m = measure(l.a, l.b);
    return T.measure.value
      .replace('{d}', formatValue(m.distance))
      .replace('{a}', formatValue(m.angle))
      .replace('{dx}', formatValue(m.dx))
      .replace('{dy}', formatValue(m.dy));
  }

  hint(): string {
    return `${this.readout() ?? T.measure.start} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
