import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { catmullRomToCubics, cubicsToPath } from '../../shared/geometry/freehand';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';

/**
 * Live preview of the freehand stroke (design 013 E5): its own `<svg>` in VIEWPORT pixels over
 * the artboard (like the selection overlay, design 007 E5) – never in the document DOM. The
 * Catmull-Rom curve of the samples so far (without RDP, as the template), the chosen stroke width
 * at the current zoom, a dashed closing line when "Closed" is on.
 */
@Component({
  selector: 'app-freehand-overlay',
  template: `
    <svg class="overlay" aria-hidden="true" data-testid="freehand-preview">
      @if (path(); as d) {
        <path class="stroke" [attr.d]="d" [attr.stroke-width]="width()" />
      }
      @if (closing(); as c) {
        <line class="closing" [attr.x1]="c.x1" [attr.y1]="c.y1" [attr.x2]="c.x2" [attr.y2]="c.y2" />
      }
    </svg>
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
    .stroke {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.85;
    }
    .closing {
      stroke: var(--ai-handle-position);
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreehandOverlay {
  /** Samples in document units. */
  readonly points = input<readonly Point[]>([]);
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  readonly closed = input(false);
  /** Stroke width in document units. */
  readonly strokeWidth = input(8);

  private readonly view = computed(() => {
    const m = this.toView();
    return this.points().map((p) => apply(m, p));
  });

  protected readonly path = computed(() => {
    const v = this.view();
    if (v.length === 1) return `M ${v[0].x} ${v[0].y} L ${v[0].x} ${v[0].y}`;
    return cubicsToPath(catmullRomToCubics(v, false), 1, false) || null;
  });

  protected readonly width = computed(() => {
    const m = this.toView();
    return Math.max(1, this.strokeWidth() * Math.hypot(m.a, m.b));
  });

  protected readonly closing = computed(() => {
    const v = this.view();
    if (!this.closed() || v.length < 2) return null;
    const a = v[v.length - 1];
    return { x1: a.x, y1: a.y, x2: v[0].x, y2: v[0].y };
  });
}
