import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { SmallPreviewService } from './small-preview.service';

/** Cells smaller than this (screen px) are not drawn. */
const MIN_CELL_PX = 4;

/** The pixel grid of the chosen target size over the canvas (prompt 057), in viewport pixels. */
@Component({
  selector: 'app-pixel-grid-overlay',
  template: `
    @if (lines(); as ls) {
      <svg class="overlay" aria-hidden="true" data-testid="pixel-grid">
        <path class="grid" [attr.d]="ls" />
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
    .grid {
      fill: none;
      stroke: var(--ai-snap-grid);
      stroke-width: 0.5;
      opacity: 0.6;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelGridOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly service = inject(SmallPreviewService);

  protected readonly lines = computed(() => {
    const n = this.service.pixelGrid();
    if (!n) return null;
    const m = this.toView();
    const cell = CANVAS_SIZE / n;
    const a = apply(m, { x: 0, y: 0 });
    const b = apply(m, { x: cell, y: 0 });
    if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_CELL_PX) return null;
    const parts: string[] = [];
    const r = (v: number) => Math.round(v * 10) / 10;
    for (let i = 0; i <= n; i++) {
      const v = i * cell;
      const h0 = apply(m, { x: 0, y: v });
      const h1 = apply(m, { x: CANVAS_SIZE, y: v });
      const v0 = apply(m, { x: v, y: 0 });
      const v1 = apply(m, { x: v, y: CANVAS_SIZE });
      parts.push(
        `M${r(h0.x)} ${r(h0.y)}L${r(h1.x)} ${r(h1.y)}M${r(v0.x)} ${r(v0.y)}L${r(v1.x)} ${r(v1.y)}`,
      );
    }
    return parts.join('');
  });
}
