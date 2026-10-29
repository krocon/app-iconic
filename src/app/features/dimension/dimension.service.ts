import { inject, Injectable } from '@angular/core';
import { Point } from '../../shared/geometry/view-transform';
import { AddService } from '../commands/add.service';
import { buildElement } from '../commands/element-defaults';
import { DimensionInput, dimensionSpec } from './dimension-markup';

const KINDS = ['linear', 'radius', 'diameter', 'angle'] as const;

function point(v: unknown): Point | null {
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && isFinite(x))
    ? { x: v[0] as number, y: v[1] as number }
    : null;
}

/**
 * The dimension from action arguments (the AI's way): `kind`, `points` (linear: two, radius /
 * diameter: the centre, angle: corner and the two ray points), `at` (where it is placed), `r`.
 */
export function inputFromArgs(args: Record<string, unknown>): DimensionInput | null {
  const kind = args['kind'];
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return null;
  const ps = Array.isArray(args['points']) ? (args['points'] as unknown[]).map(point) : [];
  const at = point(args['at']);
  if (!at || ps.some((p) => !p)) return null;
  const [a, b, c] = ps as Point[];
  switch (kind) {
    case 'linear':
      return ps.length === 2 ? { kind, a, b, at } : null;
    case 'radius':
    case 'diameter': {
      const r = args['r'];
      return ps.length === 1 && typeof r === 'number' && r > 0 ? { kind, c: a, r, at } : null;
    }
    default:
      return ps.length === 3 ? { kind: 'angle', v: a, p1: b, p2: c, at } : null;
  }
}

/**
 * Adds dimensions (prompt 048) as a `<g data-dimension>` at the insert place of "Add" (one undo
 * step, selected): lines, arrows and the value in document units.
 */
@Injectable({ providedIn: 'root' })
export class DimensionService {
  private readonly add = inject(AddService);

  insert(input: DimensionInput): Promise<boolean> {
    return this.add.insertBuilt('addDimension', undefined, (_c, local) => {
      const o = local({ x: 0, y: 0 });
      const e = local({ x: 1, y: 0 });
      const scale = Math.hypot(e.x - o.x, e.y - o.y) || 1;
      const spec = dimensionSpec(input, local, scale);
      return spec ? [buildElement(spec)] : null;
    });
  }

  insertFromArgs(args: Record<string, unknown>): Promise<boolean> | false {
    const input = inputFromArgs(args);
    return input ? this.insert(input) : false;
  }
}
