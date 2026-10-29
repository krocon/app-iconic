import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { fromSubpaths, mapSubpaths, toSubpaths } from '../../shared/geometry/pen/path-model';
import { CutTool } from './cut-tool';
import { ShapeBuilderTool } from './shape-builder-tool';

/**
 * The overlay of Shape Builder and the cuts (prompt 047), in viewport pixels: the face under the
 * pointer and the faces a drag touched (red while Alt deletes), the cut line / rectangle.
 */
@Component({
  selector: 'app-pathfinder-overlay',
  template: `
    @if (builder.on() || cut.mode()) {
      <svg class="overlay" aria-hidden="true" data-testid="pathfinder-overlay">
        @for (f of faces(); track $index) {
          <path class="face" [class.erase]="builder.erasing()" [attr.d]="f" />
        }
        @if (line(); as l) {
          <polyline class="cut" [attr.points]="l" />
        }
        @if (rect(); as r) {
          <rect class="cut" [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" />
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
    .face {
      fill: var(--ai-handle-position);
      fill-opacity: 0.25;
      fill-rule: evenodd;
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;

      &.erase {
        fill: var(--color-error);
        stroke: var(--color-error);
      }
    }
    .cut {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathfinderOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly builder = inject(ShapeBuilderTool);
  protected readonly cut = inject(CutTool);

  protected readonly faces = computed(() => {
    const rs = this.builder.regions();
    const ids = new Set(this.builder.touched());
    const h = this.builder.hover();
    if (h !== null) ids.add(h);
    const m = this.toView();
    return [...ids].flatMap((i) => {
      const sub = rs[i] ? toSubpaths(rs[i].d) : null;
      return sub ? [fromSubpaths(mapSubpaths(sub, (p) => apply(m, p)))] : [];
    });
  });

  protected readonly line = computed(() => {
    const s = this.cut.stroke();
    if (this.cut.mode() === 'rectCut' || s.length < 2) return null;
    return s
      .map((p) => apply(this.toView(), p))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  });

  protected readonly rect = computed(() => {
    const s = this.cut.stroke();
    if (this.cut.mode() !== 'rectCut' || s.length < 2) return null;
    const a = apply(this.toView(), s[0]);
    const b = apply(this.toView(), s[s.length - 1]);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  });
}
