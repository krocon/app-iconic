import { computed, Injectable, signal } from '@angular/core';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import {
  centered,
  clampPan,
  Point,
  viewToDocument,
  ViewTransform,
  zoomAround,
} from '../../shared/geometry/view-transform';
import { clampZoom, fitZoom, nextZoomStep, prevZoomStep } from '../../shared/geometry/zoom-steps';
import { GridOrigin } from '../../shared/geometry/snapping';
import { Appearance } from './appearance';
import { DEFAULT_TINT } from './tinted';
import { SelectionMode } from './selection-measure';

/** Platform mask of the preview (design 004 E8). */
export type MaskShape = 'none' | 'squircle' | 'circle';

/** View options of the canvas (design 004 E14; persisted since design 015 E6). */
export type GuideTemplate = 'apple' | 'material' | 'grid';

export interface CanvasOptions {
  rulers: boolean;
  guides: boolean;
  background: boolean;
  /** Group effects as a preview approximation (shadow, translucency, blend; design 010 E13). */
  effects: boolean;
  crossCursor: boolean;
  /** Handles of the selection (design 007 E5). */
  handles: boolean;
  /** Snapping (legacy §6: grid off, magic on; design 007 E13). */
  snapToGrid: boolean;
  magicSnap: boolean;
  /** Smart Guides beyond Magic Snap: path, tangent, perpendicular, construction (prompt 040). */
  smartGuides: boolean;
  /** The icon grid drawn as guides (prompt 056). */
  guideTemplate: GuideTemplate;
  /** Divisions of the `grid` template. */
  guideDivisions: number;
  gridOrigin: GridOrigin;
  /** Grid spacing in document units (legacy 10, design 015 E9). */
  gridSize: number;
  /** none / point / boxed (design 007 E4). */
  selectionMode: SelectionMode;
  mask: MaskShape;
  appearance: Appearance;
  /** Tint of the tinted approximation (`#rrggbb`, prompt 077 E2) – a view setting, not the document. */
  tint: string;
}

export type CanvasToggle =
  | 'rulers'
  | 'guides'
  | 'background'
  | 'effects'
  | 'crossCursor'
  | 'handles'
  | 'snapToGrid'
  | 'magicSnap'
  | 'smartGuides';

function systemAppearance(): Appearance {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * State of the canvas view of this window (design 004 E14): view transform, viewport size, pointer
 * and options. Root-provided because every window is its own WebView with exactly one canvas, and
 * the menus of 005 (View › Zoom …) and the browser test hook need it; the document state stays in
 * the `DocumentStore`. Holds the overlay host for the DOM geometry (`dom-geometry.ts`).
 */
@Injectable({ providedIn: 'root' })
export class CanvasViewStore {
  readonly view = signal<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  readonly viewport = signal({ width: 0, height: 0 });
  /** Pointer in document units, `null` outside the canvas. */
  readonly pointer = signal<Point | null>(null);
  readonly options = signal<CanvasOptions>({
    rulers: true,
    guides: true,
    background: true,
    effects: true,
    crossCursor: true,
    handles: true,
    snapToGrid: false,
    magicSnap: true,
    smartGuides: true,
    guideTemplate: 'apple',
    guideDivisions: 8,
    gridOrigin: 'worldZero',
    gridSize: 10,
    selectionMode: 'point',
    mask: 'squircle',
    appearance: systemAppearance(),
    tint: DEFAULT_TINT,
  });
  readonly zoom = computed(() => this.view().zoom);
  /** The overlay `<svg>` of the canvas (set by `CanvasView`). */
  host: SVGSVGElement | null = null;
  /** The box with the painted layers (set by `CanvasView`; hit testing, design 007 E2). */
  layers: HTMLElement | null = null;
  /** The user zoomed or panned – until then resizing keeps the artboard fitted and centred. */
  private touched = false;
  /**
   * The zoom the user chose last – `0` = fit (design 015 E7). Saved as the start zoom of new
   * windows; set only by user zooms, not by resizing.
   */
  readonly chosenZoom = signal(0);
  /** Start zoom of this window (from the settings): `0` = fit. */
  private startZoom = 0;

  /** The zoom the window starts with (before the first layout; `0` = fit). */
  setStartZoom(zoom: number): void {
    this.startZoom = zoom > 0 ? clampZoom(zoom) : 0;
    this.chosenZoom.set(this.startZoom);
  }

  setViewport(width: number, height: number): void {
    this.viewport.set({ width, height });
    if (width <= 0 || height <= 0) return;
    if (this.touched) this.view.update((v) => clampPan(v, width, height));
    else this.view.set(centered(width, height, this.startZoom || fitZoom(width, height)));
  }

  /** Zooms to `zoom` (clamped) around `anchor` (viewport pixels; default the middle). */
  zoomTo(zoom: number, anchor?: Point): void {
    const { width, height } = this.viewport();
    const at = anchor ?? { x: width / 2, y: height / 2 };
    this.touched = true;
    this.view.update((v) => clampPan(zoomAround(v, clampZoom(zoom), at), width, height));
    this.chosenZoom.set(this.zoom());
  }

  zoomIn(anchor?: Point): void {
    this.zoomTo(nextZoomStep(this.zoom()), anchor);
  }

  zoomOut(anchor?: Point): void {
    this.zoomTo(prevZoomStep(this.zoom()), anchor);
  }

  /** 100 % (⌘0). */
  actualSize(): void {
    this.zoomTo(1);
  }

  /** Continuous zoom (pinch, Ctrl+wheel). */
  zoomBy(factor: number, anchor: Point): void {
    this.zoomTo(this.zoom() * factor, anchor);
  }

  /** Largest step that fits, centred; resizing keeps it fitted again. */
  fit(): void {
    const { width, height } = this.viewport();
    this.touched = false;
    this.startZoom = 0;
    this.chosenZoom.set(0);
    this.view.set(centered(width, height, fitZoom(width, height)));
  }

  /** "Center Canvas": centred at the current zoom. */
  center(): void {
    const { width, height } = this.viewport();
    this.view.set(centered(width, height, this.zoom()));
  }

  panBy(dx: number, dy: number): void {
    const { width, height } = this.viewport();
    this.touched = true;
    this.view.update((v) =>
      clampPan({ ...v, panX: v.panX + dx, panY: v.panY + dy }, width, height),
    );
  }

  toggle(key: CanvasToggle): void {
    this.options.update((o) => ({ ...o, [key]: !o[key] }));
  }

  set<K extends keyof CanvasOptions>(key: K, value: CanvasOptions[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }

  /** Document point under a viewport pixel (pure, from the view transform). */
  toDocument(p: Point): Point {
    return viewToDocument(this.view(), p);
  }

  /** Size of the artboard on screen. */
  readonly artboardPx = computed(() => CANVAS_SIZE * this.zoom());
}
