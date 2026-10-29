import { inject, Injectable } from '@angular/core';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { SketchInteraction } from './sketch-interaction';
import { SketchService } from './sketch.service';
import { SketchStore } from './sketch.store';

/** The sketch tools (design 019) as a canvas tool: registers itself with `CanvasTools`. */
@Injectable({ providedIn: 'root' })
export class SketchTool implements CanvasTool {
  readonly id = 'sketch';
  private readonly store = inject(SketchStore);
  private readonly pointer: SketchInteraction;

  constructor() {
    const view = inject(CanvasViewStore);
    const files = inject(FilesService);
    this.pointer = new SketchInteraction(
      this.store,
      inject(SketchService),
      view,
      inject(CanvasEditStore),
      () => files.store(),
      () => view.host!,
      () => view.layers!,
    );
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.store.active();
  }
  stop(): void {
    this.store.toggle(null);
  }
  press(e: ToolPointer): void {
    this.pointer.press(e);
  }
  move(e: ToolPointer): void {
    this.pointer.move(e);
  }
  release(e: ToolPointer): void {
    this.pointer.release(e);
  }
  leave(): void {
    this.pointer.leave();
  }
  escape(): boolean {
    return this.store.escape();
  }
  hint(): string | null {
    return this.store.hint();
  }
  reset(): void {
    this.store.reset();
  }
}
