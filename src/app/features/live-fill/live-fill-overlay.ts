import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { LiveFillTool } from './live-fill-tool';
import { LIVE_FILL_TEXTS as T } from './live-fill-texts';

/** The Fill tool on the canvas (prompt 060): the area(s) under the pointer and the colour bar. */
@Component({
  selector: 'app-live-fill-overlay',
  template: `
    @if (tool.on()) {
      <svg class="overlay" aria-hidden="true" data-testid="fill-hover">
        <g [attr.transform]="matrix()">
          @for (f of tool.faces(); track $index) {
            <path class="face" [attr.d]="f.d" [attr.fill]="tool.color()" />
          }
        </g>
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
    .face {
      fill-opacity: 0.45;
      stroke: var(--ai-snap-magic);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveFillOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(LiveFillTool);
  private readonly actions = inject(ActionService);
  protected readonly t = T;
  protected readonly matrix = computed(() => {
    const m = this.toView();
    return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
  });
}
