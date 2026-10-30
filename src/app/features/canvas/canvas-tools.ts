import { DestroyRef, Injectable } from '@angular/core';

/** What a canvas tool gets from the pointer (a `PointerEvent` or a test double). */
export interface ToolPointer {
  pointerId?: number;
  clientX: number;
  clientY: number;
  button?: number;
  altKey: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  detail?: number;
}

/**
 * A tool mode of the canvas (sketch tools, pen, curvature, path tools, measure – prompts 019, 042–048):
 * while it is active the left button belongs to it instead of the selection. All its decisions run
 * through actions and serialisable commands; this is only where the pointer arrives.
 */
export interface CanvasTool {
  /** Which tool it is (`stopAll` keeps it). */
  readonly id: string;
  active(): boolean;
  /** Switch the tool off (another one comes on: one tool at a time, design 019 E3). */
  stop(): void;
  press(e: ToolPointer): void;
  move(e: ToolPointer): void;
  /** Every release reaches every tool (a tool that just ended may still own the press). */
  release(e: ToolPointer): void;
  leave(): void;
  /** Esc: drop what is being drawn, then the tool; `false` = nothing to do. */
  escape(): boolean;
  /** A double click while active (default: ignored). */
  dblclick?(e: ToolPointer): void;
  /** The status line hint while active. */
  hint?(): string | null;
  /** The window goes away: drop everything. */
  reset?(): void;
}

/**
 * A tool that takes the pointer elsewhere (freehand draws in the canvas view itself, design 013):
 * it only takes part in "one tool at a time" (prompt 061) – `stopAll` switches it off, and the
 * selection tools see it as active.
 */
export interface ToolMode {
  readonly id: string;
  active(): boolean;
  stop(): void;
}

/**
 * The tool modes of the canvas of this window: the first active one gets the pointer. With no tool
 * active the selection tools (prompt 061: `tool.select` V, `tool.direct` A) are in charge.
 */
@Injectable({ providedIn: 'root' })
export class CanvasTools {
  private readonly list: CanvasTool[] = [];
  private readonly modes: ToolMode[] = [];

  register(tool: CanvasTool, destroyRef?: DestroyRef): void {
    this.list.push(tool);
    destroyRef?.onDestroy(() => {
      const i = this.list.indexOf(tool);
      if (i >= 0) this.list.splice(i, 1);
    });
  }

  /** A tool mode without pointer handling here (prompt 061). */
  registerMode(mode: ToolMode, destroyRef?: DestroyRef): void {
    this.modes.push(mode);
    destroyRef?.onDestroy(() => {
      const i = this.modes.indexOf(mode);
      if (i >= 0) this.modes.splice(i, 1);
    });
  }

  /** Some tool or mode is on – i.e. not the selection (reads signals). */
  anyActive(): boolean {
    return this.current() !== null || this.modes.some((m) => m.active());
  }

  /** The active tool (reads the tools' signals: usable in `computed`). */
  current(): CanvasTool | null {
    return this.list.find((t) => t.active()) ?? null;
  }

  all(): readonly CanvasTool[] {
    return this.list;
  }

  escape(): boolean {
    return this.list.some((t) => t.active() && t.escape());
  }

  /** Switches every tool off but `except` (one tool at a time). */
  stopAll(except?: string): void {
    for (const t of this.list) if (t.id !== except && t.active()) t.stop();
    for (const m of this.modes) if (m.id !== except && m.active()) m.stop();
  }

  hint(): string | null {
    return this.current()?.hint?.() ?? null;
  }
}
