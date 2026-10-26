import { Injectable, signal } from '@angular/core';
import { Rect } from '../../shared/geometry/dom-geometry';
import { SnapKind } from '../../shared/geometry/snapping';
import { Point } from '../../shared/geometry/view-transform';
import { NodeRef } from '../document/icon-document';
import { GestureController } from './canvas-gesture';
import { HandleRole } from './handles/handle-types';
import { EMPTY_MODEL, SelectionModel } from './selection-measure';

/** A point handle chosen by a click (Delete removes it, design 007 E6). */
export interface ActivePoint {
  ref: NodeRef;
  role: HandleRole;
}

/**
 * Editing state of the canvas of this window (design 007 E15): group context, the chosen point,
 * the marquee, the snap indicator, the measured selection and the running drag. Root-provided like
 * the `CanvasViewStore` (one canvas per window); the document state stays in the `DocumentStore`.
 */
@Injectable({ providedIn: 'root' })
export class CanvasEditStore {
  /** Double click entered this container: clicks select its children (design 007 E3). */
  readonly context = signal<NodeRef | null>(null);
  readonly activePoint = signal<ActivePoint | null>(null);
  /** Marquee in document units while dragging on empty space. */
  readonly marquee = signal<Rect | null>(null);
  /** Where the last update snapped to (document units). */
  readonly snap = signal<{ point: Point; kind: Exclude<SnapKind, 'none'> } | null>(null);
  /** The selection as measured after the last paint (frames, handles). */
  readonly model = signal<SelectionModel>(EMPTY_MODEL);
  readonly gesture = new GestureController();

  /** Escape (design 007 E15): drag → chosen point; `false` = nothing to do (the context is next). */
  escape(): boolean {
    if (this.gesture.cancel()) return true;
    if (this.activePoint()) {
      this.activePoint.set(null);
      return true;
    }
    return false;
  }

  canEscape(): boolean {
    return this.gesture.busy || this.activePoint() !== null || this.context() !== null;
  }
}
