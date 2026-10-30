import { computed, inject, Injectable, signal } from '@angular/core';
import { nodeBoundsInDocument, Rect } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { apply } from '../../shared/geometry/matrix';
import { insidePolygon } from '../../shared/geometry/bounds-guard';
import { gridOriginPoint, snapMove, snapPoint, SnapOptions } from '../../shared/geometry/snapping';
import { Point } from '../../shared/geometry/view-transform';
import { assetPlacement } from '../canvas/asset-placement';
import { CanvasEditStore, shownSnap } from '../canvas/canvas-edit.store';
import { DragOp, Modifiers } from '../canvas/canvas-gesture';
import { CanvasTools } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { layerAsset } from '../canvas/layer-stack';
import { knownRasterSize, loadRasterSize } from '../canvas/raster-size';
import { DocumentStore } from '../document/document.store';
import { groups, layers } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { LayerItem, layerPlacement, positionCommand, toAssetSpace } from './layer-frame';
import {
  boxCentre,
  canvasMarks,
  frameCorners,
  movedPosition,
  scaledPosition,
} from './layer-position';

/** The measured content box of the layer in its asset space (before any `position`). */
interface Measured {
  key: string;
  box: Rect;
}

/** What the overlay draws: the frame corners and the centre in document units. */
export interface LayerFrame {
  item: LayerItem;
  corners: Point[];
  centre: Point;
}

/**
 * Moving and scaling a layer on the canvas (prompt 080 E8): with the selection tool, when exactly
 * one layer is selected in the tree. The content box is measured with the browser's matrices only
 * outside a gesture; while dragging the frame is `G · L(position) · box` – arithmetic only (033).
 * Every drag is one gesture of the `GestureController` (one undo step, Esc cancels) writing
 * `position` with `SetIconJsonValue`s for the edited appearance. Root service (one canvas).
 */
@Injectable({ providedIn: 'root' })
export class LayerTransformService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly tools = inject(CanvasTools);
  private readonly edit = inject(CanvasEditStore);
  private readonly measured = signal<Measured | null>(null);

  /** The one selected layer, while the selection tool is in charge. */
  readonly target = computed<LayerItem | null>(() => {
    const s = this.files.store();
    if (!s || this.view.options().selectionMode === 'none' || this.tools.anyActive()) return null;
    const items = s.items();
    if (items.length !== 1 || s.selection().length !== 0 || items[0].kind !== 'layer') return null;
    return items[0];
  });

  /** The frame now (document units); `null` without a target or before it was measured. */
  readonly frame = computed<LayerFrame | null>(() => {
    const s = this.files.store();
    const item = this.target();
    const m = this.measured();
    if (!s || !item || !m || m.key !== this.keyOf(item)) return null;
    s.revision();
    const p = layerPlacement(s.document().iconJson, item, this.view.options().appearance);
    if (!p) return null;
    return {
      item,
      corners: frameCorners(p.matrix, m.box),
      centre: apply(p.matrix, boxCentre(m.box)),
    };
  });

  private keyOf(item: LayerItem): string {
    return `${item.group}:${item.layer}:${this.view.options().appearance}`;
  }

  /**
   * Measures the content box (after the layers are painted, not during a gesture): a PNG from
   * its natural size (E7), an SVG from the live root's bounding box over the screen CTMs.
   */
  measure(): void {
    const s = this.files.store();
    const item = this.target();
    if (!s || !item) {
      this.measured.set(null);
      return;
    }
    if (s.gesture()) return;
    const box = this.contentBox(s, item);
    this.measured.set(box ? { key: this.keyOf(item), box } : null);
  }

  private contentBox(s: DocumentStore, item: LayerItem): Rect | null {
    const doc = s.document();
    const appearance = this.view.options().appearance;
    const layer = layers(groups(doc.iconJson)[item.group])[item.layer];
    const asset = layer ? layerAsset(doc, layer, appearance) : undefined;
    const placement = layerPlacement(doc.iconJson, item, appearance);
    if (!asset || !placement) return null;
    if (!asset.svg) {
      if (!asset.dataUrl) return null;
      const size = knownRasterSize(asset.dataUrl);
      if (!size) {
        void loadRasterSize(asset.dataUrl);
        return null;
      }
      return {
        x: (CANVAS_SIZE - size.width) / 2,
        y: (CANVAS_SIZE - size.height) / 2,
        ...size,
      };
    }
    const fallback = assetPlacement(asset.svg.root);
    const el = this.paintedRoot(item);
    const r = el && this.view.host ? nodeBoundsInDocument(this.view.host, el) : null;
    if (!r || !(r.width > 0) || !(r.height > 0)) return fallback;
    return toAssetSpace(placement.matrix, r) ?? fallback;
  }

  /** The asset root painted by this layer (the live root or its copy, design 004 E5). */
  private paintedRoot(item: LayerItem): SVGGraphicsElement | null {
    const host = this.view.layers?.querySelector(
      `.layer[data-group="${item.group}"][data-layer="${item.layer}"]`,
    );
    const el = host?.shadowRoot?.querySelector('svg.placement > *');
    return el instanceof SVGGraphicsElement ? el : null;
  }

  /** `p` (document units) lies in the frame of the selected layer. */
  contains(p: Point): boolean {
    const f = this.frame();
    return !!f && insidePolygon(f.corners, p);
  }

  private snapOptions(mods: Modifiers): SnapOptions {
    const o = this.view.options();
    const off = mods.altKey;
    return {
      zoom: this.view.zoom(),
      grid: o.snapToGrid && !off,
      magic: o.magicSnap && !off,
      origin: gridOriginPoint(o.gridOrigin),
      step: o.gridSize,
    };
  }

  /** Dragging inside the frame moves the layer (snapped by its corners and centre). */
  moveOp(store: DocumentStore, p0: Point): DragOp | null {
    const start = this.start(store);
    if (!start) return null;
    const { item, placement, keys, appearance } = start;
    return {
      label: 'moveLayerOnCanvas',
      update: (p, mods) => {
        const s = snapMove(
          keys,
          { x: p.x - p0.x, y: p.y - p0.y },
          canvasMarks(),
          this.snapOptions(mods),
        );
        this.edit.snap.set(shownSnap(s));
        const pos = movedPosition(placement.layer, s.delta, placement.group.scale);
        return positionCommand(
          store.document().iconJson,
          item,
          appearance,
          pos,
          'moveLayerOnCanvas',
        );
      },
      end: () => this.edit.snap.set(null),
    };
  }

  /** A corner handle scales uniformly about the frame's centre (`corner` 0…3 as `frameCorners`). */
  scaleOp(store: DocumentStore, corner: number): DragOp | null {
    const start = this.start(store);
    const m = this.measured();
    if (!start || !m || corner < 0 || corner > 3) return null;
    const { item, placement, appearance } = start;
    const frame = this.frame();
    if (!frame) return null;
    const c = frame.centre;
    const from = frame.corners[corner];
    const d0 = Math.hypot(from.x - c.x, from.y - c.y);
    if (!(d0 > 0)) return null;
    const centre = boxCentre(m.box);
    return {
      label: 'scaleLayer',
      update: (p, mods) => {
        const s = snapPoint(p, canvasMarks(), this.snapOptions(mods));
        this.edit.snap.set(shownSnap(s));
        const k = Math.hypot(s.point.x - c.x, s.point.y - c.y) / d0;
        const pos = scaledPosition(placement.layer, centre, k);
        return positionCommand(store.document().iconJson, item, appearance, pos, 'scaleLayer');
      },
      end: () => this.edit.snap.set(null),
    };
  }

  private start(store: DocumentStore) {
    const frame = this.frame();
    const appearance = this.view.options().appearance;
    const placement = frame
      ? layerPlacement(store.document().iconJson, frame.item, appearance)
      : null;
    if (!frame || !placement) return null;
    return {
      item: frame.item,
      placement,
      appearance,
      keys: [...frame.corners, frame.centre],
    };
  }
}
