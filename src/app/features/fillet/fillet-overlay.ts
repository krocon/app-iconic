import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { fromSubpaths, mapSubpaths } from '../../shared/geometry/pen/path-model';
import { FilletTool } from './fillet-tool';

/** The outline under the pointer and the first picked one (prompt 051), in viewport pixels. */
@Component({
  selector: 'app-fillet-overlay',
  template: `
    @if (tool.mode()) {
      <svg class="overlay" aria-hidden="true" data-testid="fillet-overlay">
        @if (picked(); as d) {
          <path class="picked" [attr.d]="d" />
        }
        @if (hovered(); as d) {
          <path class="hover" [attr.d]="d" />
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
    .hover,
    .picked {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 3;
      opacity: 0.5;
    }
    .picked {
      opacity: 0.9;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilletOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly tool = inject(FilletTool);
  private view(s: { subpaths: Parameters<typeof mapSubpaths>[0] } | null | undefined) {
    return s ? fromSubpaths(mapSubpaths(s.subpaths, (p) => apply(this.toView(), p))) : null;
  }
  protected readonly hovered = computed(() => this.view(this.tool.hover()));
  protected readonly picked = computed(() => this.view(this.tool.first()?.shape));
}
