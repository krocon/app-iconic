import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { cutAlong, cutByRect, PaperScope } from '../../shared/geometry/pathops/boolean-ops';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { NodeRef } from '../document/icon-document';
import { Piece, PathfinderService } from './pathfinder.service';
import { PATHFINDER_TEXTS as T } from './pathfinder-texts';

export type CutMode = 'knife' | 'lineCut' | 'rectCut';
export const CUT_MODES: readonly CutMode[] = ['knife', 'lineCut', 'rectCut'];

/** The width of the knife's cut (document units): the pieces touch, a hair apart. */
export const CUT_GAP = 0.01;

/**
 * Knife, Line Cut and Rectangle Cut (prompts 046/047; VectorCraft `cut.rs`): a freehand stroke, a
 * straight line or a rectangle through the selected filled shapes splits each of them into its
 * pieces (separate paths with the look of the shape). One undo step per cut.
 */
@Injectable({ providedIn: 'root' })
export class CutTool implements CanvasTool {
  readonly id = 'cut';
  readonly mode = signal<CutMode | null>(null);
  /** The stroke (knife), line (two points) or rectangle corners (two points) in document units. */
  readonly stroke = signal<readonly Point[]>([]);
  private readonly service = inject(PathfinderService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private scope: PaperScope | null = null;
  private pressed = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    this.mode.set(null);
    this.stroke.set([]);
    this.pressed = false;
  }

  toggle(mode: CutMode): void {
    this.stroke.set([]);
    this.mode.set(this.mode() === mode ? null : mode);
    if (this.mode()) void this.service.paper().then((s) => (this.scope = s));
  }

  private doc(e: ToolPointer): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  press(e: ToolPointer): void {
    this.pressed = true;
    this.stroke.set([this.doc(e)]);
  }

  move(e: ToolPointer): void {
    if (!this.pressed) return;
    const p = this.doc(e);
    this.stroke.update((s) => (this.mode() === 'knife' ? [...s, p] : [s[0], p]));
  }

  release(): void {
    if (!this.pressed) return;
    this.pressed = false;
    const stroke = this.stroke();
    this.stroke.set([]);
    const mode = this.mode();
    if (mode && stroke.length >= 2) this.cut(mode, stroke);
  }

  /** Cuts the selected shapes along `stroke` (a rectangle: its two corners). */
  cut(mode: CutMode, stroke: readonly Point[]): boolean {
    const scope = this.scope;
    const store = this.files.store();
    if (!scope || !store) return false;
    const ts = this.service.targets();
    if (!ts.length) {
      this.files.notice.set(T.needOne);
      return false;
    }
    const changed = [];
    const kept: NodeRef[] = [];
    const pieces: Piece[] = [];
    for (const t of ts) {
      if (t.subpaths.every((s) => !s.closed)) {
        kept.push(t.ref);
        continue;
      }
      const d = this.service.shapeOf(t).d;
      const parts =
        mode === 'rectCut'
          ? cutByRect(scope, d, box(stroke[0], stroke[stroke.length - 1]))
          : cutAlong(scope, d, stroke, CUT_GAP);
      if (parts.length < 2) {
        kept.push(t.ref);
        continue;
      }
      changed.push(t);
      pieces.push(...parts.map((p) => ({ source: t, d: p })));
    }
    if (!changed.length) return false;
    const ok = this.service.replace(changed, pieces, 'cutPath');
    if (ok) store.selection.update((s) => [...s, ...kept]);
    return ok;
  }

  leave(): void {
    /* the stroke stays until the release */
  }

  escape(): boolean {
    if (!this.mode()) return false;
    if (this.pressed) {
      this.pressed = false;
      this.stroke.set([]);
      return true;
    }
    this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    return m ? `${T.hints[m]} · ${T.escEnds}` : null;
  }

  reset(): void {
    this.stop();
  }
}

function box(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
