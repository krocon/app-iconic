import { inject, Injectable, signal } from '@angular/core';
import { Point } from '../../shared/geometry/view-transform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { PatternService } from './pattern.service';
import { PATTERN_TEXTS as T } from './pattern-texts';

export type PatternPick = 'center' | 'mirror';

/**
 * The canvas picks of the patterns (prompt 049): the centre of a circular pattern (then the
 * dialog opens) and the two points of a mirror line (then the copies are made) – snapped like the
 * drawing tools.
 */
@Injectable({ providedIn: 'root' })
export class PatternTool implements CanvasTool {
  readonly id = 'pattern';
  readonly mode = signal<PatternPick | null>(null);
  readonly points = signal<readonly Point[]>([]);
  readonly at = signal<Point | null>(null);
  private readonly service = inject(PatternService);
  private readonly dialogs = inject(DialogService);
  private readonly view = inject(CanvasViewStore);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), inject(FilesService));

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    this.mode.set(null);
    this.points.set([]);
    this.at.set(null);
    this.snap.clear();
  }

  start(mode: PatternPick): void {
    this.stop();
    this.mode.set(mode);
  }

  /** The centre is picked: the circular dialog opens with it. */
  center(c: Point): void {
    this.stop();
    this.service.dialog.set({ kind: 'circular', center: c });
    this.dialogs.show('pattern');
  }

  /** Enter: the centre of the selection. */
  confirm(): boolean {
    if (this.mode() !== 'center') return false;
    this.center(this.service.center());
    return true;
  }

  press(e: ToolPointer): void {
    const p = this.snap.point(e, this.points(), this.points().at(-1) ?? null);
    if (this.mode() === 'center') {
      this.center(p);
      return;
    }
    const pts = [...this.points(), p];
    if (pts.length < 2) {
      this.points.set(pts);
      return;
    }
    this.stop();
    this.service.mirror(pts[0], pts[1]);
  }

  move(e: ToolPointer): void {
    this.at.set(this.snap.point(e, this.points(), this.points().at(-1) ?? null));
  }

  release(): void {
    /* picks happen on press */
  }

  leave(): void {
    this.snap.clear();
  }

  escape(): boolean {
    if (!this.mode()) return false;
    if (this.points().length) this.points.set([]);
    else this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    if (!m) return null;
    const h =
      m === 'center' ? T.hints.center : this.points().length ? T.hints.mirror2 : T.hints.mirror1;
    return `${h} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
