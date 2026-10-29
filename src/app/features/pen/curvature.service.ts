import { inject, Injectable } from '@angular/core';
import { apply } from '../../shared/geometry/matrix';
import { curvatureSpline, CurvePoint } from '../../shared/geometry/pen/curvature';
import { mapAnchors, penPathData } from '../../shared/geometry/pen/pen-path';
import { SetAttributes } from '../document/commands';
import { FilesService } from '../files/files.service';
import { SketchService } from '../sketch/sketch.service';
import { CurvatureStore } from './curvature.store';
import { MAX_PEN_ANCHORS } from './pen.service';
import { PEN_TEXTS as T } from './pen-texts';

/** `points` from outside: `[[x, y], …]` (2 … 10 000); `null` if malformed. */
function parsePoints(v: unknown, corners: unknown): CurvePoint[] | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_PEN_ANCHORS) return null;
  if (corners !== undefined && (!Array.isArray(corners) || corners.length !== v.length))
    return null;
  const out: CurvePoint[] = [];
  for (const [i, p] of v.entries()) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) {
      return null;
    }
    const c = (corners as unknown[] | undefined)?.[i];
    if (c !== undefined && typeof c !== 'boolean') return null;
    out.push({ p: { x, y }, corner: c === true });
  }
  return out;
}

/**
 * Writes what the Curvature tool draws or edits (prompt 043): a new `<path>` (one undo step, the
 * remembered style of paths), or the selected path's `d` after each edit (one undo step each,
 * "Edit Path"). `curvature.tool { points, corners, closed }` draws at once (AI).
 */
@Injectable({ providedIn: 'root' })
export class CurvatureService {
  private readonly sketch = inject(SketchService);
  private readonly files = inject(FilesService);
  readonly curvature = inject(CurvatureStore);

  /** The new path; the tool goes off (one path per tool start). */
  finish(): Promise<boolean> {
    const r = this.curvature.result();
    this.curvature.toggle(false);
    return r
      ? this.sketch.insert({ kind: 'bezier', anchors: r.anchors, closed: r.closed })
      : Promise.resolve(false);
  }

  /** The edited path written into its `d`. */
  commitEdit(): void {
    const e = this.curvature.edit();
    const store = this.files.store();
    if (!e || !store) return;
    const local = mapAnchors(e.anchors, (p) => apply(e.toLocal, p));
    const d = `${e.prefix}${e.prefix ? ' ' : ''}${penPathData(local, e.closed)}`;
    store.execute(new SetAttributes([{ ref: e.ref, name: 'd', value: d }], 'editPath'));
    store.selection.set([e.ref]);
  }

  insertFromArgs(args: Record<string, unknown>): Promise<boolean> {
    const points = parsePoints(args['points'], args['corners']);
    const closed = args['closed'] ?? false;
    if (!points || typeof closed !== 'boolean') {
      this.files.notice.set(T.failed);
      return Promise.resolve(false);
    }
    const rest = { ...args };
    for (const k of ['points', 'corners', 'closed']) delete rest[k];
    return this.sketch.insert(
      { kind: 'bezier', anchors: curvatureSpline(points, closed), closed },
      rest,
    );
  }
}
