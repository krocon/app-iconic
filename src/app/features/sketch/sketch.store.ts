import { computed, Injectable, signal } from '@angular/core';
import { isDegenerate, SketchShape } from '../../shared/geometry/sketch/sketch-shapes';
import {
  FieldKey,
  Locks,
  Placed,
  resolveStep,
  shapeOf,
  SKETCH_TOOLS,
  SketchToolId,
  StepDef,
} from '../../shared/geometry/sketch/sketch-tools';
import { measure } from '../../shared/geometry/sketch/sketch-measure';
import { DEFAULT_SIDES, MAX_SIDES, MIN_SIDES } from '../../shared/geometry/sketch/polygon';
import { DragMods, DragToolId, isDragTool } from '../../shared/geometry/sketch/drag-shapes';
import { Point } from '../../shared/geometry/view-transform';
import {
  nearestAnchor,
  nearestTarget,
  SketchAnchor,
  SketchTarget,
  SketchTargets,
} from './sketch-targets';
import { SKETCH_TEXTS } from './sketch-texts';

/** Smallest shape in screen pixels (design 019 E6). */
export const MIN_SIZE_PX = 0.5;

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
  private targetsRevision = 0;
  private lastPointer: Point | null = null;
  private sweep = 0;
  /** The sides of the last polygon (the next one starts with them, like Fusion). */
  private sides = DEFAULT_SIDES;
  /** The keys held while dragging (the drag tools, prompt 041). */
  readonly mods = signal<DragMods>({});
  /** Space held while dragging: the shape moves with the pointer (VectorCraft). */
  private spaceMove = false;
  /** A click of a drag tool without a drag: the size dialog asks at this point. */
  readonly sizing = signal<{ tool: DragToolId; p: Point } | null>(null);

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
    this.spaceMove = false;
  }

  /** The targets of the painted shapes (collected by the canvas at the start of a pick step). */
  /** The targets of the painted shapes at document revision `revision`. */
  setTargets(t: SketchTargets | null, revision = 0): void {
    this.targets = t;
    this.targetsRevision = revision;
  }

  /** A pick step whose targets are missing or older than `revision` (undo, AI). */
  needsTargets(revision = 0): boolean {
    const pick = this.step()?.pick;
    if (pick !== 'tangent' && pick !== 'anchor') return false;
    return this.targets === null || this.targetsRevision !== revision;
  }

  /** The pointer moved to `p` (document units, snapped); `pxPerUnit` = zoom. */
  move(p: Point | null, pxPerUnit = 1): void {
    // Space held in a drag: the start moves along with the pointer
    if (p && this.spaceMove && this.lastPointer && this.dragging()) {
      const d = { x: p.x - this.lastPointer.x, y: p.y - this.lastPointer.y };
      this.placed.update(([first, ...rest]) => [
        { ...first, p: { x: first.p.x + d.x, y: first.p.y + d.y } },
        ...rest,
      ]);
    }
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
    const cur = resolveStep(t, this.placed(), p, this.stepLocks(), this.sweep, this.mods());
    if (cur.sweep !== undefined) this.sweep = cur.sweep;
    this.current.set(cur);
  }

  /** The typed values and, for a step with sides, the last polygon's sides unless typed. */
  private stepLocks(): Locks {
    const locks = this.locks();
    const sided = this.fields().includes('sides') || this.tool() === 'dragPolygon';
    return sided ? { sides: this.sides, ...locks } : locks;
  }

  /** A drag tool's drag is running (its start placed). */
  dragging(): boolean {
    const t = this.tool();
    return !!t && isDragTool(t) && this.placed().length === 1;
  }

  /** The keys held changed (Shift, Alt): the preview follows. */
  setMods(m: DragMods): void {
    const cur = this.mods();
    if (!!cur.shift === !!m.shift && !!cur.alt === !!m.alt) return;
    this.mods.set({ shift: !!m.shift, alt: !!m.alt });
    if (this.lastPointer) this.move(this.lastPointer);
  }

  /** Space down / up while dragging. */
  setSpaceMove(on: boolean): void {
    this.spaceMove = on;
  }

  /** The sides of the next polygon (↑/↓ while dragging, the size dialog). */
  polygonSides(): number {
    return this.sides;
  }

  /** ↑/↓ while dragging a polygon: one side more or less (3 … 64). */
  stepSides(d: number): void {
    this.sides = Math.max(MIN_SIDES, Math.min(MAX_SIDES, this.sides + d));
    if (this.lastPointer) this.move(this.lastPointer);
  }

  /** A drag tool was clicked without a drag: drop the start and ask for a size there. */
  askSize(): boolean {
    const t = this.tool();
    const start = this.placed()[0];
    if (!t || !isDragTool(t) || !start || this.placed().length !== 1) return false;
    this.reset();
    this.sizing.set({ tool: t, p: start.p });
    return true;
  }

  /** The size dialog closed: `sides` used are remembered, the tool goes off. */
  sized(sides?: number): void {
    if (sides !== undefined) this.sides = Math.max(MIN_SIDES, Math.min(MAX_SIDES, sides));
    this.sizing.set(null);
    this.reset();
    this.tool.set(null);
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
   * last step (then the tool goes off), else `null`.
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
    // the last step without a shape (no tangent circle, collinear points, nothing to see – a
    // double click, a 0 typed): nothing happens
    const last = placed.length === steps.length;
    const shape = last ? shapeOf(t, placed, null) : null;
    if (last && (!shape || isDegenerate(shape, MIN_SIZE_PX / (pxPerUnit > 0 ? pxPerUnit : 1)))) {
      return null;
    }
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
    if (shape?.kind === 'polygon') this.sides = shape.sides;
    // one shape per tool start: afterwards the pointer selects and moves again (Marc, 27.10.2026)
    this.reset();
    this.tool.set(null);
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
