import { inject, Injectable, signal } from '@angular/core';
import { loadPaper, PaperScope } from '../../shared/geometry/pathops/boolean-ops';
import {
  CornerKind,
  filletCorner,
  FilletError,
  FilletResult,
} from '../../shared/geometry/pathops/fillet';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DocCommand } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { PathfinderService, Piece } from '../pathfinder/pathfinder.service';
import { SceneShape, sceneShapes } from '../trim/trim-scene';

/** A picked side: the shape and a point on the part that stays. */
export interface PickedSide {
  shape: SceneShape;
  p: Point;
}

/** What the dialog works on. */
export interface FilletJob {
  kind: CornerKind;
  a: PickedSide;
  b: PickedSide | null;
}

/**
 * Fillet and Chamfer (prompt 051): the corner between two picked sides (or inside one path)
 * rounded / cut back, written as paths with the look of the shapes. The dialog previews live
 * (an undo gesture), OK keeps one undo step.
 */
@Injectable({ providedIn: 'root' })
export class FilletService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly writer = inject(PathfinderService);
  readonly job = signal<FilletJob | null>(null);
  /** The last radius / distance (the dialog starts with it). */
  readonly size = signal(20);
  private scope: PaperScope | null = null;
  private previewing = false;

  /** paper.js once loaded (the tool's lookups). */
  loaded(): PaperScope | null {
    return this.scope;
  }

  async ready(): Promise<PaperScope> {
    this.scope ??= await loadPaper();
    return this.scope;
  }

  scene(): SceneShape[] {
    const store = this.files.store();
    return store ? sceneShapes(store.document(), this.view.layers, this.view.host) : [];
  }

  tol(px = 6): number {
    return px / Math.max(this.view.zoom(), 1e-6);
  }

  result(job: FilletJob, r: number): FilletResult | FilletError | null {
    if (!this.scope) return null;
    return filletCorner(
      this.scope,
      { d: job.a.shape.d, p: job.a.p },
      job.b ? { d: job.b.shape.d, p: job.b.p } : null,
      r,
      job.kind,
      this.tol() * 2,
    );
  }

  private plan(job: FilletJob, r: FilletResult): { command: DocCommand; refs(): NodeRef[] } | null {
    const distinct = !!job.b && job.b.shape.el !== job.a.shape.el;
    const old = distinct ? [job.a.shape, job.b!.shape] : [job.a.shape];
    const pieces: Piece[] = [{ source: job.a.shape, d: r.a }];
    if (distinct && r.b) pieces.push({ source: job.b!.shape, d: r.b });
    return this.writer.replacePlan(old, pieces, job.kind === 'fillet' ? 'fillet' : 'chamfer');
  }

  /** Shows the corner with `r` (replacing the preview before); the error, if any. */
  preview(job: FilletJob, r: number): FilletError | null {
    const store = this.files.store();
    if (!store) return null;
    if (this.previewing) store.cancel();
    this.previewing = true;
    const res = this.result(job, r);
    store.begin(job.kind === 'fillet' ? 'fillet' : 'chamfer');
    if (!res || typeof res === 'string') return res ?? 'noSide';
    const plan = this.plan(job, res);
    if (plan) store.update(plan.command);
    return null;
  }

  commit(): void {
    const store = this.files.store();
    if (!store || !this.previewing) return;
    this.previewing = false;
    store.commit();
    store.selection.set([]);
  }

  cancel(): void {
    const store = this.files.store();
    if (!store || !this.previewing) return;
    this.previewing = false;
    store.cancel();
  }

  /** At once (the AI's way). */
  apply(job: FilletJob, r: number): FilletError | null {
    const store = this.files.store();
    const res = this.result(job, r);
    if (!store || !res) return 'noSide';
    if (typeof res === 'string') return res;
    const plan = this.plan(job, res);
    if (!plan) return 'noSide';
    store.execute(plan.command);
    store.selection.set([]);
    return null;
  }
}
