import { inject, Injectable, signal } from '@angular/core';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { TextEdit } from './text-edit';
import { TEXT_TEXTS as T } from './text-texts';

/**
 * The text tool (prompt 075 E2, ⇧T – `T` is Trim since 068): a click on a text edits it, elsewhere
 * a new text starts there; typing goes into the field over the canvas.
 */
@Injectable({ providedIn: 'root' })
export class TextTool implements CanvasTool {
  readonly id = 'text';
  readonly on = signal(false);
  private readonly edit = inject(TextEdit);

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.on();
  }

  stop(): void {
    this.on.set(false);
  }

  toggle(): void {
    this.on.update((v) => !v);
  }

  press(e: ToolPointer): void {
    if (this.edit.editing()) return;
    const ref = this.edit.textAt(e);
    if (ref) this.edit.start(ref);
    else this.edit.startNew(e.clientX, e.clientY);
  }

  move(): void {
    // the click places the text
  }

  release(): void {
    // placed on press
  }

  leave(): void {
    // nothing drawn
  }

  escape(): boolean {
    if (!this.on()) return false;
    this.stop();
    return true;
  }

  hint(): string {
    return T.toolHint;
  }
}
