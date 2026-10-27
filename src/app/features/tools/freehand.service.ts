import { inject, Injectable } from '@angular/core';
import { MAX_FREEHAND_POINTS } from '../../core/actions/tool-action-args';
import { fmt } from '../../shared/geometry/align';
import { FREEHAND_DEFAULTS, freehandPath } from '../../shared/geometry/freehand';
import { Point } from '../../shared/geometry/view-transform';
import { applyShapeArgs } from '../commands/add-args';
import { AddService } from '../commands/add.service';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { FreehandStore, FreehandStroke } from './freehand.store';
import { TOOLS_TEXTS as T } from './tools-texts';

type Args = Record<string, unknown> | undefined;

/** `[[x, y], …]` from outside (design 013 E7); `null` if malformed. */
export function parsePoints(v: unknown): Point[] | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_FREEHAND_POINTS) return null;
  const out: Point[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) {
      return null;
    }
    out.push({ x, y });
  }
  return out;
}

/** The `<path>` of a stroke (design 013 E6): stroke black, round caps and joins, no fill. */
export function freehandSpec(d: string, strokeWidth: number): ElementSpec {
  return {
    tag: 'path',
    attrs: {
      d,
      fill: 'none',
      stroke: BLACK,
      'stroke-width': fmt(strokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  };
}

/**
 * Inserts freehand strokes (design 013 E6/E7): from the canvas (points in document units, mapped
 * into the parent's user space before smoothing) or from an action's `points` (already in that
 * space). One undo step "Add Freehand" at the place of design 008 E2.
 */
@Injectable({ providedIn: 'root' })
export class FreehandService {
  private readonly add = inject(AddService);
  private readonly files = inject(FilesService);
  readonly tool = inject(FreehandStore);

  /** A stroke drawn with the mouse. */
  insertStroke(stroke: FreehandStroke): Promise<boolean> {
    return this.insert(stroke.points, true, {
      closed: stroke.closed,
      epsilon: this.tool.epsilon(),
      strokeWidth: this.tool.strokeWidth(),
    });
  }

  /** `add.freehand` with `points` (AI). */
  insertFromArgs(args: Record<string, unknown>): Promise<boolean> {
    const points = parsePoints(args['points']);
    if (!points) {
      this.files.notice.set(T.freehand.failed);
      return Promise.resolve(false);
    }
    return this.insert(points, false, args);
  }

  private insert(points: Point[], fromDocument: boolean, args: Args): Promise<boolean> {
    const closed = args?.['closed'] === true;
    const epsilon =
      typeof args?.['epsilon'] === 'number' ? args['epsilon'] : FREEHAND_DEFAULTS.epsilon;
    const width =
      typeof args?.['strokeWidth'] === 'number' ? args['strokeWidth'] : this.tool.strokeWidth();
    return this.add.insertBuilt('addFreehand', args, (_c, local) => {
      const pts = fromDocument ? points.map(local) : points;
      const d = freehandPath(pts, { closed, epsilon });
      if (!d) return null;
      const rest = { ...args };
      for (const k of ['points', 'closed', 'epsilon']) delete rest[k];
      const spec = applyShapeArgs('path', freehandSpec(d, width), rest);
      return spec ? [buildElement(spec)] : null;
    });
  }
}
