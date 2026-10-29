import { inject, Injectable } from '@angular/core';
import { mapAnchors, PenAnchor, penPathData } from '../../shared/geometry/pen/pen-path';
import { apply } from '../../shared/geometry/matrix';
import { SetAttributes } from '../document/commands';
import { FilesService } from '../files/files.service';
import { SketchService } from '../sketch/sketch.service';
import { PenStore } from './pen.store';
import { PEN_TEXTS as T } from './pen-texts';

type Args = Record<string, unknown>;

/** Most anchors a path from outside may have. */
export const MAX_PEN_ANCHORS = 10_000;

const point = (v: unknown) => {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const [x, y] = v as unknown[];
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? Math.abs(x) <= 1e5 && Math.abs(y) <= 1e5
      ? { x, y }
      : undefined
    : undefined;
};

/** `anchors` from outside: `[{ p: [x, y], in?: [x, y], out?: [x, y] }, …]`; `null` if malformed. */
export function parsePenAnchors(v: unknown): PenAnchor[] | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_PEN_ANCHORS) return null;
  const out: PenAnchor[] = [];
  for (const a of v) {
    if (typeof a !== 'object' || a === null) return null;
    const o = a as Record<string, unknown>;
    const p = point(o['p']);
    const hin = o['in'] === undefined ? null : point(o['in']);
    const hout = o['out'] === undefined ? null : point(o['out']);
    if (!p || hin === undefined || hout === undefined) return null;
    out.push({ p, hin, hout });
  }
  return out;
}

/**
 * Inserts what the pen draws (prompt 042): a new `<path>` at the place of design 008 E2 (one undo
 * step, the remembered style of paths), or the selected open path it went on with (`d` of its
 * last subpath, one undo step). From the canvas or from `pen.tool { anchors, closed }` (AI).
 */
@Injectable({ providedIn: 'root' })
export class PenService {
  private readonly sketch = inject(SketchService);
  private readonly files = inject(FilesService);
  readonly pen = inject(PenStore);

  /** The path drawn so far; the pen goes off (one path per tool start, like the sketch tools). */
  async finish(): Promise<boolean> {
    const r = this.pen.result();
    this.pen.toggle(false);
    if (!r) return false;
    const c = r.continuing;
    const store = this.files.store();
    if (c && store) {
      const local = mapAnchors(r.anchors, (p) => apply(c.toLocal, p));
      const d = `${c.prefix}${c.prefix ? ' ' : ''}${penPathData(local, r.closed)}`;
      store.execute(new SetAttributes([{ ref: c.ref, name: 'd', value: d }], 'editPath'));
      store.selection.set([c.ref]);
      return true;
    }
    return this.sketch.insert({ kind: 'bezier', anchors: r.anchors, closed: r.closed });
  }

  /** `pen.tool { anchors, closed }` (AI): the path at once. */
  insertFromArgs(args: Args): Promise<boolean> {
    const anchors = parsePenAnchors(args['anchors']);
    const closed = args['closed'] === undefined ? false : args['closed'];
    if (!anchors || typeof closed !== 'boolean') {
      this.files.notice.set(T.failed);
      return Promise.resolve(false);
    }
    const rest = { ...args };
    delete rest['anchors'];
    delete rest['closed'];
    return this.sketch.insert({ kind: 'bezier', anchors, closed }, rest);
  }
}
