import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Appearance } from '../canvas/appearance';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { exportSvg } from '../export/export-svg';
import { rasterSizes } from '../export/export.service';
import { FilesService } from '../files/files.service';

/** The sizes the small preview shows. */
export const PREVIEW_SIZES = [16, 32, 64, 128] as const;
/** Pixel grids: target sizes that divide the 1024 canvas evenly. */
export const PIXEL_GRIDS = [16, 32, 64, 128] as const;
export type PixelGrid = 0 | (typeof PIXEL_GRIDS)[number];

/** Waiting after a change before the preview is drawn again (ms). */
const DEBOUNCE = 250;

/**
 * The small-size preview and the pixel grid (prompt 057): the icon as the export draws it (same
 * SVG, the browser rasterises it at 16 … 128 px), redrawn shortly after every change; the pixel
 * grid of a target size shows its cells on the canvas and makes them the snapping grid.
 */
@Injectable({ providedIn: 'root' })
export class SmallPreviewService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  /** The preview is shown (session). */
  readonly visible = signal(false);
  /** The icon as an SVG data URL (`null` before the first drawing). */
  readonly url = signal<string | null>(null);
  /** The pixel grid's target size; 0 = off (session). */
  readonly pixelGrid = signal<PixelGrid>(0);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const store = this.files.store();
      store?.revision();
      const o = this.view.options();
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(
          () => void this.draw(o.appearance, o.mask, o.effects, o.tint),
          DEBOUNCE,
        );
      });
    });
  }

  private async draw(
    appearance: Appearance,
    mask: 'none' | 'squircle' | 'circle',
    effects: boolean,
    tint: string,
  ) {
    const store = this.files.store();
    if (!store) return;
    const seq = ++this.seq;
    const doc = store.document();
    const svg = exportSvg(doc, appearance, { mask, effects, tint }, await rasterSizes(doc));
    if (seq !== this.seq) return;
    this.url.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }

  /** Turns the pixel grid of `size` on (snapping to its cells) or off. */
  setPixelGrid(size: PixelGrid): void {
    this.pixelGrid.set(size);
    if (size) {
      this.view.set('gridSize', CANVAS_SIZE / size);
      this.view.set('gridOrigin', 'worldZero');
      this.view.set('snapToGrid', true);
    }
  }
}
