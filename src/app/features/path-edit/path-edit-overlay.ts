import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { BRUSH_PX, PathEditTool } from './path-edit-tool';

/**
 * The path tools' overlay (prompt 046): the anchors of the selected paths as small squares and
 * the brush stroke of Smooth / Path Eraser – its own `<svg>` in viewport pixels.
 */
@Component({
  selector: 'app-path-edit-overlay',
  template: `
    @if (tool.mode()) {
      <svg class="overlay" aria-hidden="true" data-testid="path-edit-overlay">
        @if (stroke(); as d) {
          <polyline class="brush" [attr.points]="d" [attr.stroke-width]="brush * 2" />
        }
        @for (a of anchors(); track $index) {
          <rect class="anchor" [attr.x]="a.x - 3" [attr.y]="a.y - 3" width="6" height="6" />
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
    .brush {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.3;
    }
    .anchor {
      fill: var(--ai-handle-stroke);
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathEditOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(PathEditTool);
  protected readonly brush = BRUSH_PX;
  protected readonly anchors = computed(() =>
    this.tool.anchors().map((p) => apply(this.toView(), p)),
  );
  protected readonly stroke = computed(() => {
    const s = this.tool.stroke();
    return s.length
      ? s
          .map((p) => apply(this.toView(), p))
          .map((p) => `${p.x},${p.y}`)
          .join(' ')
      : null;
  });
}
