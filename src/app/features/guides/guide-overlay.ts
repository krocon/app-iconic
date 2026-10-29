import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { GuideService } from './guide.service';

/** The guide being dragged out of a ruler (prompt 056), across the viewport. */
@Component({
  selector: 'app-guide-overlay',
  template: `
    @if (line(); as l) {
      <svg class="overlay" aria-hidden="true" data-testid="guide-preview">
        <line class="guide" [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" />
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
    .guide {
      stroke: var(--ai-guide-user);
      stroke-width: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly guides = inject(GuideService);
  protected readonly line = computed(() => {
    const g = this.guides.preview();
    if (!g) return null;
    const p = apply(this.toView(), g.axis === 'horizontal' ? { x: 0, y: g.at } : { x: g.at, y: 0 });
    return g.axis === 'horizontal'
      ? { x1: -10000, y1: p.y, x2: 10000, y2: p.y }
      : { x1: p.x, y1: -10000, x2: p.x, y2: 10000 };
  });
}
