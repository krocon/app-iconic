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
      <div
        class="bar"
        role="toolbar"
        [attr.aria-label]="t.toolbar"
        (pointerdown)="$event.stopPropagation()"
      >
        <label class="label" for="fill-color">{{ t.color }}</label>
        <input
          id="fill-color"
          type="color"
          data-testid="fill-color"
          [value]="tool.color()"
          (input)="setColor($event)"
        />
        <span class="live">{{ t.live }}</span>
      </div>
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
    .bar {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 4px 8px;
      pointer-events: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      box-shadow: var(--shadow-popup);
      font-size: var(--font-size-small);
    }
    .live {
      color: var(--color-text-muted);
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

  protected setColor(e: Event): void {
    this.actions.run('fill.color', { color: (e.target as HTMLInputElement).value });
  }
}
