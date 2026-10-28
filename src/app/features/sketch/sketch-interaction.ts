import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { gridOriginPoint, snapPoint } from '../../shared/geometry/snapping';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { magicPoints } from '../canvas/magic-points';
import { DocumentStore } from '../document/document.store';
import { collectSketchTargets } from './sketch-targets';
import { SketchService } from './sketch.service';
import { SketchStore } from './sketch.store';

/** Released this far (screen px) from where it was pressed: the release places the next point. */
export const DRAG_PLACE_PX = 4;

interface PointerLike {
  clientX: number;
  clientY: number;
  altKey: boolean;
}

/**
 * The pointer while a sketch tool is on (design 019 E3, E4): every position snapped (grid, Magic
 * Snap on the shapes and on the points of the running tool; ⌥ = off), a click places the step,
 * dragging from a point and releasing places the next one. Pick steps (edges, circles, line ends)
 * are not snapped – the targets are collected once per step. Plain class; `CanvasView` owns it.
 */
export class SketchInteraction {
  private magic: { revision: number; points: Point[] } | null = null;
  private down: { x: number; y: number; step: number } | null = null;

  constructor(
    private readonly sketch: SketchStore,
    private readonly service: SketchService,
    private readonly view: CanvasViewStore,
    private readonly edit: CanvasEditStore,
    private readonly store: () => DocumentStore | null,
    private readonly host: () => SVGSVGElement,
    private readonly layers: () => HTMLElement,
  ) {}

  /** Document point of `e`, snapped on point steps (shows the snap indicator). */
  private point(e: PointerLike): Point {
    const raw = clientToDocument(this.host(), e);
    const step = this.sketch.step();
    this.edit.snap.set(null);
    if (step?.pick !== 'point') return raw;
    const o = this.view.options();
    const off = e.altKey;
    const r = snapPoint(raw, this.candidates(), {
      zoom: this.view.zoom(),
      grid: o.snapToGrid && !off,
      magic: o.magicSnap && !off,
      origin: gridOriginPoint(o.gridOrigin),
      step: o.gridSize,
    });
    if (r.kind !== 'none' && r.target) {
      this.edit.snap.set({ point: r.target, kind: r.kind, guides: r.guides });
    }
    return r.point;
  }

  /** Magic Snap candidates: the painted shapes (once per document revision) and the placed points. */
  private candidates(): Point[] {
    const store = this.store();
    if (!this.view.options().magicSnap || !store) return [];
    const revision = store.revision();
    if (!this.magic || this.magic.revision !== revision) {
      this.magic = {
        revision,
        points: magicPoints(this.layers(), this.host(), store.document(), []),
      };
    }
    return [...this.magic.points, ...this.sketch.placed().map((p) => p.p)];
  }

  /** Collects the pick targets when the step needs them. */
  private targets(): void {
    const revision = this.store()?.revision() ?? 0;
    if (this.sketch.needsTargets(revision)) {
      this.sketch.setTargets(collectSketchTargets(this.layers(), this.host()), revision);
    }
  }

  move(e: PointerLike): void {
    if (!this.sketch.active()) return;
    this.targets();
    this.sketch.move(this.point(e), this.view.zoom());
  }

  /** Left button pressed: places the step (and inserts a finished shape). */
  press(e: PointerLike): void {
    if (!this.sketch.active()) return;
    this.targets();
    const before = this.sketch.placed().length;
    this.place(e);
    this.down = { x: e.clientX, y: e.clientY, step: before };
  }

  /** Released: after a drag from the point just placed, the release places the next one. */
  release(e: PointerLike): void {
    const d = this.down;
    this.down = null;
    if (!d || !this.sketch.active()) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_PLACE_PX;
    const next = this.sketch.step();
    if (moved && this.sketch.placed().length === d.step + 1 && next?.pick === 'point') {
      this.targets();
      this.place(e);
    }
  }

  leave(): void {
    this.down = null;
    this.edit.snap.set(null);
    this.sketch.move(null);
  }

  private place(e: PointerLike): void {
    const result = this.sketch.place(this.point(e), this.view.zoom());
    this.edit.snap.set(null);
    if (result) void this.service.insert(result.shape);
  }
}
