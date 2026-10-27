import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gridDotsNear } from '../../shared/geometry/grid-hint';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';

/** What the hint needs: pointer and grid in document units; `null` = no hint. */
export interface GridHintInput {
  pointer: Point;
  origin: Point;
  step: number;
}

/**
 * The grid near the pointer (Marc, 27.10.2026; `grid-hint.ts`): only while Snap to Grid is on,
 * dots on the crossings around the pointer, fading out, the nearest crossing larger. Its own
 * `<svg>` in VIEWPORT pixels under the selection overlay, no pointer events.
 */
@Component({
  selector: 'app-grid-hint-overlay',
  template: `
    @if (dots().length) {
      <svg class="grid-hint" aria-hidden="true" data-testid="grid-hint">
        @for (d of dots(); track $index) {
          <circle
            [class.nearest]="d.nearest"
            [attr.cx]="d.x"
            [attr.cy]="d.y"
            [attr.r]="d.nearest ? 2.5 : 1.5"
            [attr.opacity]="d.opacity"
            [attr.data-x]="d.doc.x"
            [attr.data-y]="d.doc.y"
          />
        }
      </svg>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .grid-hint {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;

      circle {
        fill: var(--ai-snap-grid);
        stroke: var(--ai-handle-stroke);
        stroke-width: 0.5;

        &.nearest {
          stroke-width: 1;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridHintOverlay {
  readonly hint = input<GridHintInput | null>(null);
  /** Document → viewport pixels (as in the selection overlay). */
  readonly toView = input<Matrix>(IDENTITY);

  protected readonly dots = computed(() => {
    const h = this.hint();
    if (!h) return [];
    const v = this.toView();
    const pxPerUnit = Math.hypot(v.a, v.b);
    return gridDotsNear(h.pointer, h.origin, h.step, pxPerUnit).map((d) => {
      const p = apply(v, d.point);
      return {
        x: p.x,
        y: p.y,
        doc: d.point,
        nearest: d.nearest,
        opacity: Math.round((0.15 + 0.85 * d.weight) * 100) / 100,
      };
    });
  });
}
