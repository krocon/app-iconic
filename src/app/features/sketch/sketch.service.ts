import { inject, Injectable } from '@angular/core';
import { MAX_SKETCH_POINTS, SKETCH_VALUE_KEYS } from '../../core/actions/sketch-action-args';
import { validSides } from '../../shared/geometry/sketch/polygon';
import { isDegenerate, SketchShape } from '../../shared/geometry/sketch/sketch-shapes';
import {
  Locks,
  Placed,
  resolveStep,
  shapeOf,
  SKETCH_TOOLS,
  SketchToolId,
} from '../../shared/geometry/sketch/sketch-tools';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { applyShapeArgs } from '../commands/add-args';
import { AddService } from '../commands/add.service';
import { buildElement } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { kindOf, shapeSpec } from './sketch-elements';
import { collectSketchTargets, nearestAnchor, nearestTarget } from './sketch-targets';
import { PICK_TOLERANCE_PX, SketchStore } from './sketch.store';
import { SKETCH_TEXTS as T } from './sketch-texts';
import { StyleMemory } from './style-memory';

type Args = Record<string, unknown> | undefined;

/** `[[x, y], …]` from outside (design 019 E14); `null` if malformed. */
export function parseSketchPoints(v: unknown): Point[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SKETCH_POINTS) return null;
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

/** `values` from outside: known keys with finite numbers; `null` if malformed. */
export function parseSketchValues(v: unknown): Locks | null {
  if (v === undefined) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: Locks = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!(SKETCH_VALUE_KEYS as readonly string[]).includes(k)) return null;
    if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e5) return null;
    if (k === 'sides' && !validSides(x)) return null;
    out[k as keyof Locks] = x;
  }
  return out;
}

/** Arguments that are not paint or place (handled here, not by `applyShapeArgs`). */
const OWN_ARGS = ['points', 'values'];

/**
 * Inserts what the sketch tools draw (design 019 E11, E14): from the canvas (`SketchStore`) or
 * from an action's `points` / `values` (AI) replayed through the same pure steps. One undo step
 * per shape at the place of design 008 E2, paint from the style memory (E13) unless the caller
 * gives it.
 */
@Injectable({ providedIn: 'root' })
export class SketchService {
  private readonly add = inject(AddService);
  private readonly files = inject(FilesService);
  private readonly canvas = inject(CanvasViewStore);
  private readonly memory = inject(StyleMemory);
  private readonly freehand = inject(FreehandStore);
  readonly tool = inject(SketchStore);

  /** The tool on/off (an action without arguments); the freehand tool goes off. */
  toggle(tool: SketchToolId): void {
    this.freehand.toggle(false);
    this.tool.toggle(tool);
  }

  /** Inserts `shape` (document units) as one undo step. */
  insert(shape: SketchShape, args?: Args): Promise<boolean> {
    const { kind, label } = kindOf(shape);
    const rest = { ...args };
    for (const k of OWN_ARGS) delete rest[k];
    const addKind = kind === 'arc' ? 'path' : kind;
    return this.add.insertBuilt(label, args, (_c, _local, toLocal) => {
      const own = shapeSpec(shape, toLocal, this.memory.attrs(kind));
      const spec = applyShapeArgs(addKind, own, rest);
      if (!spec) return null;
      // a caller's transform goes in front of the shape's own (rotation, parent matrix)
      const mine = own.attrs['transform'];
      const theirs = spec.attrs['transform'];
      if (mine && theirs !== mine) spec.attrs['transform'] = theirs ? `${theirs} ${mine}` : mine;
      return [buildElement(spec)];
    });
  }

  /** `sketch.* { points, values }` (AI): the steps of `tool` with these clicks and typed values. */
  insertFromArgs(tool: SketchToolId, args: Record<string, unknown>): Promise<boolean> {
    const shape = this.replay(tool, args);
    if (!shape) return Promise.resolve(false);
    return this.insert(shape, args);
  }

  /** The shape the clicks `points` and the `values` make; a notice and `null` if none. */
  private replay(tool: SketchToolId, args: Record<string, unknown>): SketchShape | null {
    const points = parseSketchPoints(args['points']);
    const values = parseSketchValues(args['values']);
    const steps = SKETCH_TOOLS[tool].steps;
    if (!points || !values || points.length !== steps.length) {
      this.files.notice.set(T.failed);
      return null;
    }
    const needsTargets = steps.some((s) => s.pick !== 'point');
    const targets = needsTargets
      ? collectSketchTargets(this.canvas.layers, this.canvas.host)
      : null;
    const tol = PICK_TOLERANCE_PX / Math.max(this.canvas.zoom(), 1e-6);
    const placed: Placed[] = [];
    const taken: string[] = [];
    let sweep = 0;
    for (const [i, step] of steps.entries()) {
      const p = points[i];
      if (step.pick === 'tangent') {
        const hit = nearestTarget(targets?.targets ?? [], p, tol, taken);
        if (!hit) {
          this.files.notice.set(T.noTarget);
          return null;
        }
        taken.push(hit.key);
        placed.push({ p, tangent: hit.tangent });
        continue;
      }
      if (step.pick === 'anchor') {
        const hit = nearestAnchor(targets?.anchors ?? [], p, tol);
        if (!hit) {
          this.files.notice.set(T.noTarget);
          return null;
        }
        placed.push({ p: hit.anchor.p, anchor: hit.anchor });
        continue;
      }
      const locks: Locks = {};
      for (const f of step.fields) if (values[f] !== undefined) locks[f] = values[f];
      const cur = resolveStep(tool, placed, p, locks, sweep);
      sweep = cur.sweep ?? sweep;
      placed.push(cur);
    }
    const found = shapeOf(tool, placed, null);
    const shape = found && !isDegenerate(found, 1e-6) ? found : null;
    const tangent = tool === 'circle2t' || tool === 'circle3t';
    if (!shape) this.files.notice.set(tangent && !found ? T.noSolution : T.failed);
    return shape;
  }
}
