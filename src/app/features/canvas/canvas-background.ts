import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { FillPreview } from './fill-preview';

/** Id of the background gradient – the only canvas id in the window document (assets live in shadow roots). */
const GRADIENT_ID = 'ai-canvas-fill';

/** The icon background (design 004 E7): one rect with the fill preview. */
@Component({
  selector: 'app-canvas-background',
  template: `
    <svg
      class="background"
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      @switch (fill().kind) {
        @case ('linear') {
          @if (linear(); as l) {
            <defs>
              <linearGradient
                [attr.id]="gradientId"
                [attr.x1]="l.start.x"
                [attr.y1]="l.start.y"
                [attr.x2]="l.stop.x"
                [attr.y2]="l.stop.y"
              >
                @for (c of l.stops; track $index) {
                  <stop [attr.offset]="offset($index, l.stops.length)" [style.stop-color]="c" />
                }
              </linearGradient>
            </defs>
          }
        }
        @case ('radial') {
          @if (radial(); as r) {
            <defs>
              <radialGradient
                [attr.id]="gradientId"
                [attr.cx]="r.center.x"
                [attr.cy]="r.center.y"
                [attr.r]="r.radius"
              >
                @for (c of r.stops; track $index) {
                  <stop [attr.offset]="offset($index, r.stops.length)" [style.stop-color]="c" />
                }
              </radialGradient>
            </defs>
          }
        }
      }
      @if (fill().kind !== 'none') {
        <rect [attr.width]="size" [attr.height]="size" [style.fill]="paint()" />
      }
    </svg>
  `,
  styles: `
    :host,
    svg {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasBackground {
  readonly fill = input.required<FillPreview>();
  protected readonly size = CANVAS_SIZE;
  protected readonly gradientId = GRADIENT_ID;
  protected readonly linear = computed(() => {
    const f = this.fill();
    return f.kind === 'linear' ? f : null;
  });
  protected readonly radial = computed(() => {
    const f = this.fill();
    return f.kind === 'radial' ? f : null;
  });
  protected readonly paint = computed(() => {
    const f = this.fill();
    return f.kind === 'solid' ? f.color : `url(#${GRADIENT_ID})`;
  });

  protected offset(i: number, n: number): number {
    return n > 1 ? i / (n - 1) : 0;
  }
}
