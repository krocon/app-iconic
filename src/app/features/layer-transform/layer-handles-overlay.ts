import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { rasterSizeVersion } from '../canvas/raster-size';
import { FilesService } from '../files/files.service';
import { IMAGE_LAYER_TEXTS as T } from '../image-layer/image-layer-texts';
import { LayerTransformService } from './layer-transform.service';

/** Corner handle size in screen pixels (like the size handles of 007). */
const HANDLE = 9;
const CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'];

/**
 * The frame and the four scale handles of the selected layer (prompt 080 E8), in viewport pixels
 * over the canvas. Only the handles take pointer events; their `data-layer-handle` (0…3) tells the
 * canvas which one is pressed – the drag itself runs in `CanvasInteraction` (one gesture). The
 * content box is measured here once per change after painting, never during a gesture.
 */
@Component({
  selector: 'app-layer-handles-overlay',
  template: `
    @if (shown(); as s) {
      <svg class="overlay" data-testid="layer-handles">
        <polygon class="frame" [attr.points]="s.points">
          <title>{{ t.handles.frame }}</title>
        </polygon>
        @for (h of s.handles; track $index) {
          <rect
            class="handle"
            [attr.data-layer-handle]="$index"
            [attr.x]="h.x - size / 2"
            [attr.y]="h.y - size / 2"
            [attr.width]="size"
            [attr.height]="size"
            [style.cursor]="cursors[$index]"
          >
            <title>{{ t.handles.corner }}</title>
          </rect>
        }
      </svg>
    }
  `,
  styles: `
    :host,
    .overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .frame {
      fill: none;
      stroke: var(--ai-handle-size);
      stroke-width: 1.5;
    }
    .handle {
      pointer-events: all;
      fill: var(--ai-handle-size);
      stroke: var(--ai-handle-stroke);
      stroke-width: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerHandlesOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly layers = inject(LayerTransformService);
  protected readonly t = T;
  protected readonly size = HANDLE;
  protected readonly cursors = CURSORS;

  protected readonly shown = computed(() => {
    const f = this.layers.frame();
    if (!f) return null;
    const v = this.toView();
    const handles = f.corners.map((p) => apply(v, p));
    return { handles, points: handles.map((p) => `${p.x},${p.y}`).join(' ') };
  });

  constructor() {
    const files = inject(FilesService);
    const view = inject(CanvasViewStore);
    let frame = 0;
    // after the layers are painted (needs layout), again after every change – not while dragging
    effect(() => {
      const s = files.store();
      s?.revision();
      s?.items();
      s?.gesture();
      view.options();
      rasterSizeVersion();
      this.layers.target();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.layers.measure());
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));
  }
}
