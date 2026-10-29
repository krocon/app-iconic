import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import {
  contains,
  divide,
  PaperScope,
  Region,
  uniteAll,
} from '../../shared/geometry/pathops/boolean-ops';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { PathTarget } from '../path-edit/path-edit.service';
import { Piece, PathfinderService } from './pathfinder.service';
import { PATHFINDER_TEXTS as T } from './pathfinder-texts';

/**
 * The Shape Builder (prompt 047; VectorCraft `tools/src/builder.rs`, Illustrator): the selected
 * shapes split into the faces of their arrangement; hovering highlights a face, dragging across
 * faces merges them into one path (the look of the first), Alt + drag deletes them. Every drag
 * one undo step; the result stays selected, so the next drag goes on with it.
 */
@Injectable({ providedIn: 'root' })
export class ShapeBuilderTool implements CanvasTool {
  readonly id = 'shapeBuilder';
  readonly on = signal(false);
  readonly regions = signal<readonly Region[]>([]);
  readonly hover = signal<number | null>(null);
  readonly touched = signal<ReadonlySet<number>>(new Set());
  readonly erasing = signal(false);
  private readonly service = inject(PathfinderService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private targets: PathTarget[] = [];
  private scope: PaperScope | null = null;
  private revision = -1;
  private dragging = false;
  private seq = 0;

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
    if (this.on()) return this.stop();
    this.on.set(true);
    void this.refresh();
  }

  private clear(): void {
    this.regions.set([]);
    this.hover.set(null);
    this.touched.set(new Set());
    this.dragging = false;
    this.targets = [];
    this.revision = -1;
  }

  /** The faces of the selected shapes (again after every change of the document). */
  async refresh(): Promise<void> {
    const seq = ++this.seq;
    const store = this.files.store();
    this.scope ??= await this.service.paper();
    if (seq !== this.seq || !this.on()) return;
    this.targets = this.service.targets();
    this.revision = store?.revision() ?? -1;
    if (!this.targets.length) {
      this.files.notice.set(T.needOne);
      this.regions.set([]);
      return;
    }
    this.regions.set(
      divide(
        this.scope,
        this.targets.map((t) => this.service.shapeOf(t)),
      ),
    );
  }

  private doc(e: ToolPointer): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  private regionAt(p: Point): number | null {
    if (!this.scope) return null;
    const rs = this.regions();
    // the front faces first (later regions come from shapes further in front)
    for (let i = rs.length - 1; i >= 0; i--) if (contains(this.scope, rs[i].d, p)) return i;
    return null;
  }

  press(e: ToolPointer): void {
    if ((this.files.store()?.revision() ?? -1) !== this.revision) void this.refresh();
    this.dragging = true;
    this.erasing.set(e.altKey);
    const i = this.regionAt(this.doc(e));
    this.hover.set(i);
    this.touched.set(new Set(i === null ? [] : [i]));
  }

  move(e: ToolPointer): void {
    const i = this.regionAt(this.doc(e));
    this.hover.set(i);
    if (this.dragging && i !== null && !this.touched().has(i)) {
      this.touched.update((s) => new Set([...s, i]));
    }
  }

  release(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const touched = [...this.touched()];
    this.touched.set(new Set());
    if (!touched.length || !this.scope) return;
    this.apply(touched, this.erasing());
  }

  /** Merges (or with `erase` deletes) the faces `touched`; the others stay as they are. */
  apply(touched: readonly number[], erase: boolean): boolean {
    const rs = this.regions();
    if (!this.scope || !rs.length) return false;
    const rest = rs.filter((_, i) => !touched.includes(i));
    const pieces: Piece[] = this.service.piecesOf(this.targets, rest);
    if (!erase) {
      const first = rs[touched[0]];
      const d = uniteAll(
        this.scope,
        touched.map((i) => rs[i].d),
      );
      if (d) pieces.push({ source: this.targets[first.source], d });
    }
    const ok = this.service.replace(this.targets, pieces, 'shapeBuilder');
    if (ok) void this.refresh();
    return ok;
  }

  leave(): void {
    if (!this.dragging) this.hover.set(null);
  }

  escape(): boolean {
    if (!this.on()) return false;
    this.stop();
    return true;
  }

  hint(): string {
    return `${T.hints.shapeBuilder} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
