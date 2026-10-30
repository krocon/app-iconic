import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { loadPaper, PaperScope } from '../../shared/geometry/pathops/boolean-ops';
import { extendAt, trimAt } from '../../shared/geometry/pathops/trim';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { PathfinderService, Piece } from '../pathfinder/pathfinder.service';
import { boxesMeet, SceneShape, sceneShapes } from './trim-scene';
import { TRIM_TEXTS as T } from './trim-texts';

export type TrimMode = 'trim' | 'extend';

/** Pick distance (screen px). */
export const TRIM_PICK_PX = 6;

/** The state of a shape while a drag trims it (document units). */
interface Working {
  shape: SceneShape;
  d: string;
}

/**
 * Trim (T) and Extend (E) like Fusion 360 (prompt 050): Trim cuts away the piece of an outline
 * between its neighbouring crossings with every other painted outline (construction lines too) –
 * a drag across several pieces cuts them all as one undo step; Extend lengthens an open end to
 * the next outline. Shapes become paths with their look.
 */
@Injectable({ providedIn: 'root' })
export class TrimTool implements CanvasTool {
  readonly id = 'trim';
  readonly mode = signal<TrimMode | null>(null);
  /** The pieces to cut (hover, and what a drag has collected) in document units. */
  readonly pieces = signal<readonly string[]>([]);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private readonly writer = inject(PathfinderService);
  private scope: PaperScope | null = null;
  private scene: { revision: number; shapes: SceneShape[] } | null = null;
  private drag: Map<string, Working> | null = null;
  private dragPieces: string[] = [];

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    this.mode.set(null);
    this.pieces.set([]);
    this.drag = null;
  }

  toggle(mode: TrimMode): void {
    this.pieces.set([]);
    this.mode.set(this.mode() === mode ? null : mode);
    if (this.mode()) {
      void loadPaper().then((s) => {
        this.scope = s;
        // the pointer may already be over a piece
        if (this.last && this.mode() === 'trim') this.hover(this.last);
      });
    }
  }

  private tol(): number {
    return TRIM_PICK_PX / Math.max(this.view.zoom(), 1e-6);
  }

  private doc(e: ToolPointer): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  private shapes(): SceneShape[] {
    const store = this.files.store();
    const revision = store?.revision() ?? -1;
    if (store && this.scene?.revision !== revision) {
      this.scene = {
        revision,
        shapes: sceneShapes(store.document(), this.view.layers, this.view.host),
      };
    }
    return this.scene?.shapes ?? [];
  }

  private key = (s: SceneShape) => `${s.ref.asset}:${s.ref.id}`;

  /** The current outline of a shape (during a drag: after the cuts so far). */
  private dOf(s: SceneShape): string {
    return this.drag?.get(this.key(s))?.d ?? s.d;
  }

  /** The cut at `p`: the shape nearest to it and what is left / goes. */
  cutAt(p: Point): { shape: SceneShape; keep: string; piece: string } | null {
    if (!this.scope) return null;
    const tol = this.tol();
    const all = this.shapes();
    const probe = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    let best: { shape: SceneShape; keep: string; piece: string; dist: number } | null = null;
    for (const s of all) {
      const d = this.dOf(s);
      // locked shapes cut the others but are never cut (prompt 064)
      if (s.locked || !d || !boxesMeet(s.box, probe, tol)) continue;
      const others = all
        .filter((o) => o !== s && boxesMeet(o.box, s.box, 1))
        .map((o) => this.dOf(o))
        .filter(Boolean);
      const r = trimAt(this.scope, d, others, p, tol);
      if (!r) continue;
      const dist = this.distance(d, p);
      if (!best || dist < best.dist) best = { shape: s, ...r, dist };
    }
    return best;
  }

  private distance(d: string, p: Point): number {
    const path = new this.scope!.CompoundPath({ pathData: d, insert: false });
    const loc = path.getNearestLocation(new this.scope!.Point(p.x, p.y));
    return loc ? loc.distance : Infinity;
  }

  press(e: ToolPointer): void {
    if (!this.scope) {
      // paper.js is still loading (first use): act once it is there
      void this.ready().then(() => this.press(e));
      return;
    }
    const p = this.doc(e);
    if (this.mode() === 'extend') {
      this.extend(p);
      return;
    }
    this.drag = new Map();
    this.dragPieces = [];
    this.collect(p);
  }

  private collect(p: Point): void {
    const c = this.cutAt(p);
    if (!c || !this.drag) return;
    this.drag.set(this.key(c.shape), { shape: c.shape, d: c.keep });
    if (c.piece) this.dragPieces.push(c.piece);
    this.pieces.set([...this.dragPieces]);
  }

  move(e: ToolPointer): void {
    if (this.mode() !== 'trim') return;
    const p = this.doc(e);
    if (this.drag) {
      this.collect(p);
      return;
    }
    this.hover(p);
  }

  private last: Point | null = null;

  private hover(p: Point): void {
    this.last = p;
    const c = this.cutAt(p);
    this.pieces.set(c?.piece ? [c.piece] : []);
  }

  release(): void {
    const drag = this.drag;
    this.drag = null;
    this.pieces.set([]);
    if (!drag?.size) return;
    this.write([...drag.values()], 'trim');
  }

  /** Writes the new outlines (empty = the shape goes) as one undo step. */
  private write(changed: readonly Working[], label: 'trim' | 'extend'): void {
    const store = this.files.store();
    if (!store) return;
    const pieces: Piece[] = changed.filter((w) => w.d).map((w) => ({ source: w.shape, d: w.d }));
    if (
      this.writer.replace(
        changed.map((w) => w.shape),
        pieces,
        label,
      )
    )
      store.selection.set([]);
  }

  /** Trim at `p` at once (the AI's way). */
  trimAt(p: Point): boolean {
    const c = this.cutAt(p);
    if (!c) return false;
    this.write([{ shape: c.shape, d: c.keep }], 'trim');
    return true;
  }

  /** Extend the end nearest to `p`. */
  extend(p: Point): boolean {
    if (!this.scope) return false;
    const tol = this.tol() * 1.5;
    const all = this.shapes();
    for (const s of all) {
      if (s.locked || !boxesMeet(s.box, { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, tol)) continue;
      const r = extendAt(
        this.scope,
        s.d,
        all.filter((o) => o !== s).map((o) => o.d),
        p,
        tol,
      );
      if (r) {
        this.write([{ shape: s, d: r.keep }], 'extend');
        return true;
      }
    }
    this.files.notice.set(T.nothing);
    return false;
  }

  leave(): void {
    if (!this.drag) this.pieces.set([]);
  }

  escape(): boolean {
    if (!this.mode()) return false;
    if (this.drag) {
      this.drag = null;
      this.pieces.set([]);
    } else this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    return m ? `${T.hints[m]} · ${T.escEnds}` : null;
  }

  reset(): void {
    this.stop();
  }

  /** paper.js is there (the AI's calls wait for it). */
  async ready(): Promise<void> {
    this.scope ??= await loadPaper();
  }
}
