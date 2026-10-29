import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { mapAnchors, PenAnchor, penPathData } from '../../shared/geometry/pen/pen-path';

/**
 * The path being drawn by the pen or the curvature tool (prompts 042, 043): its own `<svg>` in
 * VIEWPORT pixels (never in the document DOM) – the path with the rubber band, the anchors as
 * small squares, the handles of the anchors as lines with dots.
 */
@Component({
  selector: 'app-pen-overlay',
  template: `
    <svg class="overlay" aria-hidden="true" data-testid="pen-preview">
      @if (d(); as path) {
        <path class="path" [attr.d]="path" />
      }
      @for (h of handles(); track $index) {
        <line class="tie" [attr.x1]="h.a.x" [attr.y1]="h.a.y" [attr.x2]="h.b.x" [attr.y2]="h.b.y" />
        <circle class="handle" [attr.cx]="h.b.x" [attr.cy]="h.b.y" r="3" />
      }
      @for (a of points(); track $index) {
        <rect
          class="anchor"
          [class.active]="a.active"
          [attr.x]="a.x - 3.5"
          [attr.y]="a.y - 3.5"
          width="7"
          height="7"
        />
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
    .path {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
    .tie {
      stroke: var(--ai-handle-control);
      stroke-width: 1;
    }
    .handle {
      fill: var(--ai-handle-control);
    }
    .anchor {
      fill: var(--ai-handle-stroke);
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;

      &.active {
        fill: var(--ai-handle-position);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PenOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  readonly anchors = input<readonly PenAnchor[]>([]);
  readonly closed = input(false);
  /** The anchors placed (the rubber band's end is not one); the last one is active. */
  readonly placed = input(0);

  private readonly view = computed(() =>
    mapAnchors(this.anchors(), (p) => apply(this.toView(), p)),
  );
  protected readonly d = computed(() => penPathData(this.view(), this.closed()) || null);
  protected readonly points = computed(() =>
    this.view()
      .slice(0, this.placed())
      .map((a, i) => ({ ...a.p, active: i === this.placed() - 1 })),
  );
  protected readonly handles = computed(() =>
    this.view()
      .slice(0, this.placed())
      .flatMap((a) => [a.hin, a.hout].flatMap((h) => (h ? [{ a: a.p, b: h }] : []))),
  );
}
