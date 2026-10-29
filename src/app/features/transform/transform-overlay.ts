import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { TransformTool } from './transform-tool';

/** The pivot of the transform tools (prompt 053) and the line to the pointer, in viewport pixels. */
@Component({
  selector: 'app-transform-overlay',
  template: `
    @if (pivot(); as p) {
      <svg class="overlay" aria-hidden="true" data-testid="transform-overlay">
        @if (line(); as l) {
          <line class="arm" [attr.x1]="p.x" [attr.y1]="p.y" [attr.x2]="l.x" [attr.y2]="l.y" />
        }
        <circle class="pivot" [attr.cx]="p.x" [attr.cy]="p.y" r="6" />
        <line
          class="cross"
          [attr.x1]="p.x - 10"
          [attr.y1]="p.y"
          [attr.x2]="p.x + 10"
          [attr.y2]="p.y"
        />
        <line
          class="cross"
          [attr.x1]="p.x"
          [attr.y1]="p.y - 10"
          [attr.x2]="p.x"
          [attr.y2]="p.y + 10"
        />
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
    .pivot {
      fill: none;
      stroke: var(--ai-handle-pivot);
      stroke-width: 1.5;
    }
    .cross,
    .arm {
      stroke: var(--ai-handle-pivot);
      stroke-width: 1;
    }
    .arm {
      stroke-dasharray: 4 3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly tool = inject(TransformTool);
  protected readonly pivot = computed(() => {
    const p = this.tool.mode() ? this.tool.pivot() : null;
    return p ? apply(this.toView(), p) : null;
  });
  protected readonly line = computed(() => {
    const a = this.tool.at();
    return a ? apply(this.toView(), a) : null;
  });
}
