import { inject, Injectable, signal } from '@angular/core';
import { formatValue } from '../../shared/geometry/dimension';
import {
  dragAngle,
  dragScale,
  IDENTITY_SPEC,
  TransformSpec,
} from '../../shared/geometry/transform-ops';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DrawSnap } from '../canvas/draw-snap';
import { FilesService } from '../files/files.service';
import { TransformService } from './transform.service';
import { TRANSFORM_TEXTS as T } from './transform-texts';

export type TransformMode = 'rotate' | 'scale' | 'reflect';

const DRAG_PX = 3;

/**
 * Rotate, Scale and Reflect tools (prompt 053, like Illustrator's R / S / O): the pivot starts in
 * the middle of the selection, a click moves it (snapped); a drag rotates / scales / reflects
 * about it live, ⇧ snaps, ⌥ on release keeps the original and makes a copy. One undo step.
 */
@Injectable({ providedIn: 'root' })
export class TransformTool implements CanvasTool {
  readonly id = 'transform';
  readonly mode = signal<TransformMode | null>(null);
  readonly pivot = signal<Point | null>(null);
  /** The pointer while dragging (the overlay draws a line from the pivot). */
  readonly at = signal<Point | null>(null);
  readonly spec = signal<TransformSpec | null>(null);
  private readonly service = inject(TransformService);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly snap = new DrawSnap(this.view, inject(CanvasEditStore), this.files);
  private press0: { client: Point; doc: Point } | null = null;
  private dragging = false;

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.mode() !== null;
  }

  stop(): void {
    if (this.service.busy) this.service.cancel();
    this.mode.set(null);
    this.pivot.set(null);
    this.at.set(null);
    this.spec.set(null);
    this.press0 = null;
    this.dragging = false;
    this.snap.clear();
  }

  toggle(mode: TransformMode): void {
    if (this.mode() === mode) return this.stop();
    this.mode.set(mode);
    const b = this.service.bounds();
    if (!this.pivot()) this.pivot.set(b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null);
  }

  private specFor(p: Point, e: ToolPointer): TransformSpec | null {
    const pivot = this.pivot();
    const a = this.press0?.doc;
    if (!pivot || !a) return null;
    switch (this.mode()) {
      case 'rotate':
        return { ...IDENTITY_SPEC, rotate: dragAngle(pivot, a, p, e.shiftKey ? 15 : 0) };
      case 'scale':
        return { ...IDENTITY_SPEC, ...dragScale(pivot, a, p, !!e.shiftKey) };
      case 'reflect': {
        // reflecting across the line at θ = flipping vertically, then turning by 2θ
        let theta = (Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180) / Math.PI;
        if (e.shiftKey) theta = Math.round(theta / 45) * 45;
        return { ...IDENTITY_SPEC, reflect: 'vertical', rotate: 2 * theta };
      }
      default:
        return null;
    }
  }

  press(e: ToolPointer): void {
    if (!this.service.canRun()) {
      this.files.notice.set(T.needSelection);
      return;
    }
    this.press0 = { client: { x: e.clientX, y: e.clientY }, doc: this.snap.point(e) };
    this.dragging = false;
  }

  move(e: ToolPointer): void {
    const p0 = this.press0;
    if (!p0) {
      this.snap.point(e);
      return;
    }
    if (!this.dragging && Math.hypot(e.clientX - p0.client.x, e.clientY - p0.client.y) < DRAG_PX) {
      return;
    }
    this.dragging = true;
    const p = this.snap.point(e, [], this.pivot());
    this.at.set(p);
    const spec = this.specFor(p, e);
    this.spec.set(spec);
    const pivot = this.pivot();
    if (spec && pivot) this.service.preview({ spec, pivot, each: false, copy: false });
  }

  release(e: ToolPointer): void {
    const p0 = this.press0;
    this.press0 = null;
    if (!p0) return;
    if (!this.dragging) {
      this.pivot.set(p0.doc);
      return;
    }
    this.dragging = false;
    this.at.set(null);
    const spec = this.spec();
    const pivot = this.pivot();
    this.spec.set(null);
    if (e.altKey && spec && pivot) {
      this.service.cancel();
      this.service.apply({ spec, pivot, each: false, copy: true });
    } else this.service.commit();
  }

  leave(): void {
    this.snap.clear();
  }

  escape(): boolean {
    if (!this.mode()) return false;
    if (this.dragging) {
      this.service.cancel();
      this.dragging = false;
      this.press0 = null;
      this.at.set(null);
      this.spec.set(null);
    } else this.stop();
    return true;
  }

  hint(): string | null {
    const m = this.mode();
    if (!m) return null;
    const s = this.spec();
    let value: string = T.hints[m];
    if (s && m === 'rotate') value = T.values.rotate.replace('{v}', formatValue(s.rotate));
    if (s && m === 'scale') {
      value = T.values.scale
        .replace('{x}', formatValue(s.sx * 100))
        .replace('{y}', formatValue(s.sy * 100));
    }
    if (s && m === 'reflect') value = T.values.reflect.replace('{v}', formatValue(s.rotate / 2));
    return `${value} · ${T.escEnds}`;
  }

  reset(): void {
    this.stop();
  }
}
