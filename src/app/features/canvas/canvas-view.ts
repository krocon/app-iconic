import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CANVAS_SIZE, iconGuides } from '../../shared/geometry/icon-guides';

/**
 * Placeholder of the canvas (prompt 004 builds the real one: document SVG in the DOM, zoom,
 * pan, rulers). Shows the empty 1024 × 1024 artboard with the Apple icon guides.
 */
@Component({
  selector: 'app-canvas-view',
  template: `
    <svg
      class="artboard"
      [attr.viewBox]="'0 0 ' + size + ' ' + size"
      role="img"
      aria-label="Empty 1024 × 1024 canvas with icon guides"
    >
      <rect class="paper" [attr.width]="size" [attr.height]="size" rx="185" />
      <g class="guides">
        @for (l of guides.lines; track $index) {
          <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" />
        }
        @for (c of guides.circles; track $index) {
          <circle [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="c.r" />
        }
      </g>
    </svg>
  `,
  styles: `
    :host {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background: var(--ai-workspace-bg);
    }
    .artboard {
      width: min(100%, 70vh);
      aspect-ratio: 1;
      overflow: visible;
    }
    .paper {
      fill: var(--color-surface);
      filter: drop-shadow(0 2px 10px rgb(0 0 0 / 20%));
    }
    .guides {
      fill: none;
      stroke: var(--ai-guide);
      stroke-width: 1.5;
      opacity: 0.55;
      vector-effect: non-scaling-stroke;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasView {
  protected readonly size = CANVAS_SIZE;
  protected readonly guides = iconGuides();
}
