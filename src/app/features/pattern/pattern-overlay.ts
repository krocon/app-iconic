import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { PatternTool } from './pattern-tool';

/** The picks of the pattern tool (prompt 049) in viewport pixels: points and the mirror line. */
@Component({
  selector: 'app-pattern-overlay',
  template: `
    @if (tool.mode()) {
      <svg class="overlay" aria-hidden="true" data-testid="pattern-overlay">
        @if (line(); as l) {
          <line
            class="axis"
            [attr.x1]="l.a.x"
            [attr.y1]="l.a.y"
            [attr.x2]="l.b.x"
            [attr.y2]="l.b.y"
          />
        }
        @for (p of points(); track $index) {
          <circle class="pick" [attr.cx]="p.x" [attr.cy]="p.y" r="4" />
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
    .axis {
      stroke: var(--ai-construction);
      stroke-width: 1.5;
      stroke-dasharray: 8 3 2 3;
    }
    .pick {
      fill: var(--ai-construction);
      stroke: var(--ai-handle-stroke);
      stroke-width: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatternOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(PatternTool);

  protected readonly points = computed(() => {
    const at = this.tool.at();
    return [...this.tool.points(), ...(at ? [at] : [])].map((p) => apply(this.toView(), p));
  });

  protected readonly line = computed(() => {
    const [a] = this.tool.points();
    const b = this.tool.at();
    if (this.tool.mode() !== 'mirror' || !a || !b) return null;
    // the axis runs on past both points
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const k = 4000 / l;
    return {
      a: apply(this.toView(), { x: a.x - dx * k, y: a.y - dy * k }),
      b: apply(this.toView(), { x: b.x + dx * k, y: b.y + dy * k }),
    };
  });
}
