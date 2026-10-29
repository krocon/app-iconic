import { inject, Injectable, signal } from '@angular/core';
import { loadPaper, PaperScope } from '../../shared/geometry/pathops/boolean-ops';
import { LineCap, LineJoin, offsetPath, strokeArea } from '../../shared/geometry/pathops/offset';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { PathTarget } from '../path-edit/path-edit.service';
import { PathfinderService, Piece } from '../pathfinder/pathfinder.service';
import { OFFSET_TEXTS as T } from './offset-texts';

export interface OffsetOptions {
  distance: number;
  join: LineJoin;
  /** Replace the originals (else the offset paths go above them). */
  replace: boolean;
}

const JOINS: readonly LineJoin[] = ['miter', 'round', 'bevel'];
const CAPS: readonly LineCap[] = ['butt', 'round', 'square'];

/** Units of the document per unit of the element (its matrix's mean scale). */
function scaleOf(t: PathTarget): number {
  const m = t.toLocal;
  const det = Math.abs(m.a * m.d - m.b * m.c);
  return det > 0 ? 1 / Math.sqrt(det) : 1;
}

/**
 * Offset Path and Outline Stroke (prompt 052) on the selected shapes: new paths with the look of
 * their source; the dialog previews live (an undo gesture), OK keeps one undo step.
 */
@Injectable({ providedIn: 'root' })
export class OffsetService {
  private readonly files = inject(FilesService);
  private readonly writer = inject(PathfinderService);
  /** The dialog's last choice. */
  readonly last = signal<OffsetOptions>({ distance: 10, join: 'round', replace: false });
  private previewing: { refs: readonly NodeRef[] } | null = null;
  private targetsAtStart: PathTarget[] = [];

  canRun(): boolean {
    return (this.files.store()?.selection().length ?? 0) > 0;
  }

  private targets(): PathTarget[] {
    return this.previewing ? this.targetsAtStart : this.writer.targets();
  }

  private plan(scope: PaperScope, o: OffsetOptions) {
    const pieces: Piece[] = [];
    const ts = this.targets();
    for (const t of ts) {
      const rule = getComputedStyle(t.el).fillRule;
      const d = offsetPath(
        scope,
        this.writer.shapeOf(t).d,
        o.distance,
        o.join,
        4,
        rule === 'evenodd',
      );
      if (d) pieces.push({ source: t, d });
    }
    if (!pieces.length) return null;
    return this.writer.replacePlan(o.replace ? ts : [], pieces, 'offsetPath', !o.replace);
  }

  /** At once (the AI's way, and OK without a preview). */
  async offset(o: OffsetOptions): Promise<boolean> {
    const store = this.files.store();
    const plan = this.plan(await loadPaper(), o);
    if (!store || !plan) {
      this.files.notice.set(T.nothing);
      return false;
    }
    store.execute(plan.command);
    store.selection.set(plan.refs());
    return true;
  }

  /** The dialog's live preview (replaces the one before). */
  async preview(o: OffsetOptions): Promise<boolean> {
    // from here on synchronous: previews must not overlap
    const scope = await loadPaper();
    const store = this.files.store();
    if (!store) return false;
    if (this.previewing) store.cancel();
    else {
      this.targetsAtStart = this.writer.targets();
      this.previewing = { refs: [...store.selection()] };
    }
    const plan = this.plan(scope, o);
    store.begin('offsetPath');
    if (plan) store.update(plan.command);
    this.lastRefs = plan ? plan.refs : null;
    return !!plan;
  }
  private lastRefs: (() => NodeRef[]) | null = null;

  commit(o: OffsetOptions): void {
    const store = this.files.store();
    if (!store || !this.previewing) return;
    store.commit();
    if (this.lastRefs) store.selection.set(this.lastRefs());
    this.previewing = null;
    this.last.set(o);
  }

  cancel(): void {
    const store = this.files.store();
    const p = this.previewing;
    this.previewing = null;
    if (!store || !p) return;
    store.cancel();
    store.selection.set(p.refs);
  }

  /**
   * Outline Stroke: the stroke of each selected shape becomes a filled path with the stroke's
   * paint; a shape with a fill keeps it (without stroke) underneath. One undo step.
   */
  async outlineStroke(): Promise<boolean> {
    const store = this.files.store();
    const scope = await loadPaper();
    const ts = this.writer.targets();
    const pieces: Piece[] = [];
    const old: PathTarget[] = [];
    for (const t of ts) {
      const cs = getComputedStyle(t.el);
      const width = parseFloat(cs.strokeWidth) * scaleOf(t);
      if (cs.stroke === 'none' || !(width > 0)) continue;
      const join = (JOINS as readonly string[]).includes(cs.strokeLinejoin)
        ? (cs.strokeLinejoin as LineJoin)
        : 'miter';
      const cap = (CAPS as readonly string[]).includes(cs.strokeLinecap)
        ? (cs.strokeLinecap as LineCap)
        : 'butt';
      const area = strokeArea(scope, this.writer.shapeOf(t).d, {
        width,
        join,
        cap,
        miterLimit: parseFloat(cs.strokeMiterlimit) || 4,
      });
      if (!area) continue;
      old.push(t);
      if (cs.fill !== 'none' && t.subpaths.some((sp) => sp.closed))
        pieces.push({ source: t, d: this.writer.shapeOf(t).d, attrs: { stroke: 'none' } });
      pieces.push({
        source: t,
        d: area,
        attrs: {
          fill: t.el.getAttribute('stroke') ?? cs.stroke,
          'fill-opacity': cs.strokeOpacity === '1' ? null : cs.strokeOpacity,
          'fill-rule': 'nonzero',
          stroke: 'none',
          'stroke-width': null,
          'stroke-linecap': null,
          'stroke-linejoin': null,
          'stroke-miterlimit': null,
          'stroke-dasharray': null,
          'stroke-dashoffset': null,
          'stroke-opacity': null,
        },
      });
    }
    if (!store || !pieces.length) {
      this.files.notice.set(T.noStroke);
      return false;
    }
    const plan = this.writer.replacePlan(old, pieces, 'outlineStroke');
    if (!plan) return false;
    store.execute(plan.command);
    store.selection.set(plan.refs());
    return true;
  }
}
