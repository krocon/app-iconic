import { inject, Injectable, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { CornerKind } from '../../shared/geometry/pathops/fillet';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { boxesMeet, SceneShape } from '../trim/trim-scene';
import { FilletService, PickedSide } from './fillet.service';
import { FILLET_TEXTS as T } from './fillet-texts';

/** A shape under the pointer: where on it, how far, and the middle of its longer side. */
interface Near {
  shape: SceneShape;
  dist: number;
  /** A point in the middle of the longer part beside the pointer (the part that stays). */
  longer: Point;
  /** Distance to the nearest vertex of the subpath. */
  vertex: number;
}

/**
 * Fillet / Chamfer like Fusion 360 (prompt 051): click a corner – where two outlines meet, or a
 * vertex of one path – or the first and then the second outline; the dialog asks for the radius
 * (distance) and previews it live.
 */
@Injectable({ providedIn: 'root' })
export class FilletTool implements CanvasTool {
  readonly id = 'fillet';
  readonly mode = signal<CornerKind | null>(null);
  readonly first = signal<PickedSide | null>(null);
  readonly hover = signal<SceneShape | null>(null);
  private readonly service = inject(FilletService);
  private readonly dialogs = inject(DialogService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private scene: { revision: number; shapes: SceneShape[] } | null = null;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    this.mode.set(null);
    this.first.set(null);
    this.hover.set(null);
  }

  toggle(kind: CornerKind): void {
    this.first.set(null);
    this.mode.set(this.mode() === kind ? null : kind);
    if (this.mode()) void this.service.ready();
  }

  private shapes(): SceneShape[] {
    const revision = this.files.store()?.revision() ?? -1;
    if (this.scene?.revision !== revision) this.scene = { revision, shapes: this.service.scene() };
    return this.scene.shapes;
  }

  /** The shapes near `p`, nearest first. */
  near(p: Point): Near[] {
    const scope = this.service.loaded();
    if (!scope) return [];
    const tol = this.service.tol();
    const probe = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    const q = new scope.Point(p.x, p.y);
    const out: Near[] = [];
    for (const shape of this.shapes()) {
      // both shapes of a fillet change: locked ones are never candidates (prompt 064)
      if (shape.locked || !boxesMeet(shape.box, probe, tol)) continue;
      const c = new scope.CompoundPath({ pathData: shape.d, insert: false });
      let best: { path: paper.Path; at: number; d: number } | null = null;
      for (const s of c.children as paper.Path[]) {
        const loc = s.getNearestLocation(q);
        if (loc && (!best || loc.distance < best.d))
          best = { path: s, at: loc.offset, d: loc.distance };
      }
      if (!best || best.d > tol) continue;
      const { path, at } = best;
      const len = path.length;
      const mid = at < len / 2 ? (at + len) / 2 : at / 2;
      const m = path.getPointAt(mid);
      const vertex = Math.min(...path.segments.map((sg) => sg.point.getDistance(q)));
      out.push({ shape, dist: best.d, longer: { x: m.x, y: m.y }, vertex });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  private doc(e: ToolPointer): Point {
    return this.view.host ? clientToDocument(this.view.host, e) : { x: 0, y: 0 };
  }

  press(e: ToolPointer): void {
    const kind = this.mode();
    if (!kind) return;
    if (!this.service.loaded()) {
      // paper.js is still loading (first use): pick once it is there
      void this.service.ready().then(() => this.press(e));
      return;
    }
    const p = this.doc(e);
    const near = this.near(p);
    if (!near.length) return;
    const first = this.first();
    if (first) {
      this.open({ kind, a: first, b: { shape: near[0].shape, p } });
      return;
    }
    const tol = this.service.tol();
    const others = near.filter((n) => n.shape !== near[0].shape);
    if (others.length) {
      // where two outlines meet: each keeps its longer side
      this.open({
        kind,
        a: { shape: near[0].shape, p: near[0].longer },
        b: { shape: others[0].shape, p: others[0].longer },
      });
      return;
    }
    if (near[0].vertex <= tol * 1.5) {
      this.open({ kind, a: { shape: near[0].shape, p }, b: null });
      return;
    }
    this.first.set({ shape: near[0].shape, p });
  }

  private open(job: { kind: CornerKind; a: PickedSide; b: PickedSide | null }): void {
    this.first.set(null);
    this.hover.set(null);
    this.service.job.set(job);
    this.dialogs.show('fillet');
  }

  move(e: ToolPointer): void {
    this.hover.set(this.near(this.doc(e))[0]?.shape ?? null);
  }

  release(): void {
    /* picks happen on press */
  }

  leave(): void {
    this.hover.set(null);
  }

  escape(): boolean {
    if (!this.mode()) return false;
    if (this.first()) this.first.set(null);
    else this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    if (!m) return null;
    return `${this.first() ? `${T.titles[m]}: ${T.hints.second}` : T.hints[m]} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
