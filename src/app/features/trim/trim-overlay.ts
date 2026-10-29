import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { fromSubpaths, mapSubpaths, toSubpaths } from '../../shared/geometry/pen/path-model';
import { TrimTool } from './trim-tool';

/** The pieces Trim would cut (prompt 050), red over the outline, in viewport pixels. */
@Component({
  selector: 'app-trim-overlay',
  template: `
    @if (tool.mode()) {
      <svg class="overlay" aria-hidden="true" data-testid="trim-overlay">
        @for (d of pieces(); track $index) {
          <path class="piece" [attr.d]="d" />
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
    .piece {
      fill: none;
      stroke: var(--color-error);
      stroke-width: 4;
      stroke-linecap: round;
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrimOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(TrimTool);
  protected readonly pieces = computed(() =>
    this.tool.pieces().flatMap((d) => {
      const s = toSubpaths(d);
      return s ? [fromSubpaths(mapSubpaths(s, (p) => apply(this.toView(), p)))] : [];
    }),
  );
}
