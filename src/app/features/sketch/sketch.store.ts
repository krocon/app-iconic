import { computed, Injectable, signal } from '@angular/core';
import { SketchShape } from '../../shared/geometry/sketch/sketch-shapes';
import {
  FieldKey,
  Locks,
  measure,
  Placed,
  resolveStep,
  shapeOf,
  SKETCH_TOOLS,
  SketchToolId,
  StepDef,
} from '../../shared/geometry/sketch/sketch-tools';
import { Point } from '../../shared/geometry/view-transform';
import {
  nearestAnchor,
  nearestTarget,
  SketchAnchor,
  SketchTarget,
  SketchTargets,
} from './sketch-targets';
import { SKETCH_TEXTS } from './sketch-texts';

/** Pick distance of edges, circles and line ends in screen pixels (design 019 E10). */
export const PICK_TOLERANCE_PX = 8;

/** A finished shape and the steps that made it. */
export interface SketchResult {
  tool: SketchToolId;
  shape: SketchShape;
}

/**
 * The sketch tool of this window (design 019 E3–E6): which tool, the steps placed so far, the
 * typed values of the current step, the pointer's step and the picked / hovered targets.
 * Root-provided like the `FreehandStore` (one canvas per window). Pure state – the canvas feeds it
 * snapped pointer positions and the targets of the painted shapes, `SketchService` inserts.
 */
@Injectable({ providedIn: 'root' })
export class SketchStore {
  readonly tool = signal<SketchToolId | null>(null);
  readonly placed = signal<readonly Placed[]>([]);
  /** Typed (fixed) values of the current step. */
  readonly locks = signal<Locks>({});
  /** The current step from the pointer, `null` while the pointer is off the canvas. */
  readonly current = signal<Placed | null>(null);
  /** The edge / circle / line end under the pointer (pick steps). */
  readonly hover = signal<SketchTarget | SketchAnchor | null>(null);
  /** What the pick steps picked (highlighted). */
  readonly picked = signal<readonly SketchTarget[]>([]);
  /** Raised when a step was placed (the overlay focuses the first field again). */
  readonly stepSerial = signal(0);
  private targets: SketchTargets | null = null;
  private lastPointer: Point | null = null;
  private sweep = 0;

  readonly active = computed(() => this.tool() !== null);
  readonly step = computed((): StepDef | null => {
    const t = this.tool();
    return t ? (SKETCH_TOOLS[t].steps[this.placed().length] ?? null) : null;
  });
  /** The fields of the current step (none before the first point). */
  readonly fields = computed((): FieldKey[] => this.step()?.fields ?? []);
  /** What the fields show: typed values, else measured from the pointer. */
  readonly values = computed((): Locks => {
    const t = this.tool();
    const cur = this.current();
    if (!t || !cur) return { ...this.locks() };
    return { ...measure(t, this.placed(), cur), ...this.locks() };
  });
  readonly preview = computed((): SketchShape | null => {
    const t = this.tool();
    return t ? shapeOf(t, this.placed(), this.current()) : null;
  });
  /** The status line hint of the step (design 019 E3). */
  readonly hint = computed(() => {
    const tool = this.tool();
    if (!tool) return null;
    const hint = SKETCH_TEXTS.steps[tool][this.placed().length] ?? '';
    return `${hint} · ${SKETCH_TEXTS.escEnds}`;
  });
  /** A shape is being drawn (something placed or typed). */
  readonly busy = computed(() => this.placed().length > 0 || Object.keys(this.locks()).length > 0);

  /** Switches `tool` on; the same tool again (or `null`) switches it off. */
  toggle(tool: SketchToolId | null): void {
    const next = tool === this.tool() ? null : tool;
    this.reset();
    this.tool.set(next);
  }

  /** Drops the shape being drawn (the tool stays). */
  reset(): void {
    this.lastPointer = null;
    this.placed.set([]);
    this.locks.set({});
    this.current.set(null);
    this.hover.set(null);
    this.picked.set([]);
    this.sweep = 0;
    this.targets = null;
  }

  /** The targets of the painted shapes (collected by the canvas at the start of a pick step). */
  setTargets(t: SketchTargets | null): void {
    this.targets = t;
  }

  get needsTargets(): boolean {
    const pick = this.step()?.pick;
    return (pick === 'tangent' || pick === 'anchor') && this.targets === null;
  }

  /** The pointer moved to `p` (document units, snapped); `pxPerUnit` = zoom. */
  move(p: Point | null, pxPerUnit = 1): void {
    // off the canvas the last position stays: Enter with typed values still places the step
    if (p) this.lastPointer = p;
    const t = this.tool();
    const step = this.step();
    if (!t || !step || !p) {
      this.current.set(null);
      this.hover.set(null);
      return;
    }
    const tol = PICK_TOLERANCE_PX / (pxPerUnit > 0 ? pxPerUnit : 1);
    if (step.pick === 'tangent') {
      const taken = this.picked().map((x) => x.key);
      const hit = nearestTarget(this.targets?.targets ?? [], p, tol, taken);
      this.hover.set(hit);
      this.current.set(hit ? { p, tangent: hit.tangent } : null);
      return;
    }
    if (step.pick === 'anchor') {
      const hit = nearestAnchor(this.targets?.anchors ?? [], p, tol);
      this.hover.set(hit);
      this.current.set(hit ? { p: hit.anchor.p, anchor: hit.anchor } : null);
      return;
    }
    this.hover.set(null);
    const cur = resolveStep(t, this.placed(), p, this.locks(), this.sweep);
    if (cur.sweep !== undefined) this.sweep = cur.sweep;
    this.current.set(cur);
  }

  /** A typed value of the current step; `null` unlocks it. */
  setLock(field: FieldKey, value: number | null): void {
    this.locks.update((l) => {
      const next = { ...l };
      if (value === null || !Number.isFinite(value)) delete next[field];
      else next[field] = value;
      return next;
    });
    if (this.lastPointer) this.move(this.lastPointer);
  }

  /**
   * Places the current step (a click, or Enter in a field); the finished shape when it was the
   * last step (then the next shape starts), else `null`.
   */
  place(p: Point | null = this.lastPointer, pxPerUnit = 1): SketchResult | null {
    const t = this.tool();
    if (!t || !p) return null;
    this.move(p, pxPerUnit);
    const cur = this.current();
    if (!cur) return null;
    const hover = this.hover();
    const placed = [...this.placed(), cur];
    const steps = SKETCH_TOOLS[t].steps;
    // the last step without a shape (no tangent circle, collinear points): nothing happens
    const shape = placed.length === steps.length ? shapeOf(t, placed, null) : null;
    if (placed.length === steps.length && !shape) return null;
    if (hover && 'tangent' in hover) this.picked.update((x) => [...x, hover]);
    this.locks.set({});
    this.targets =
      steps[placed.length]?.pick === steps[placed.length - 1]?.pick ? this.targets : null;
    this.stepSerial.update((n) => n + 1);
    if (placed.length < steps.length) {
      this.placed.set(placed);
      this.move(p, pxPerUnit);
      return null;
    }
    this.reset();
    return shape ? { tool: t, shape } : null;
  }

  /** Esc (design 019 E3): the shape first, then the tool; `false` = nothing to do. */
  escape(): boolean {
    if (this.busy()) {
      this.reset();
      this.stepSerial.update((n) => n + 1);
      return true;
    }
    if (!this.tool()) return false;
    this.toggle(null);
    return true;
  }
}
