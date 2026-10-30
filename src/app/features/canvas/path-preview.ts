import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import { IDENTITY, Matrix, multiply } from '../../shared/geometry/matrix';

/** One outline of a preview: path data in its node's space and that space → document. */
export interface PreviewPath {
  d: string;
  toDocument: Matrix;
  kind: 'before' | 'after';
}

/** Most outlines drawn (a preview is a hint, not the document). */
export const MAX_PREVIEW_PATHS = 400;

/**
 * Outlines a dialog shows on the canvas without changing the document (prompt 073 E4: "Optimize
 * Path" before / after). Root service: one preview at a time; the dialog clears it when it closes.
 */
@Injectable({ providedIn: 'root' })
export class PathPreview {
  readonly paths = signal<readonly PreviewPath[]>([]);

  show(paths: readonly PreviewPath[]): void {
    this.paths.set(paths.slice(0, MAX_PREVIEW_PATHS));
  }

  clear(): void {
    if (this.paths().length) this.paths.set([]);
  }
}

/** The outlines of `PathPreview` in viewport pixels: before dashed and muted, after in the accent. */
@Component({
  selector: 'app-path-preview-overlay',
  template: `
    @if (shown().length) {
      <svg class="overlay" aria-hidden="true" data-testid="path-preview">
        @for (p of shown(); track $index) {
          <path [class]="p.kind" [attr.d]="p.d" [attr.transform]="p.transform" />
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
    path {
      fill: none;
      vector-effect: non-scaling-stroke;
    }
    .before {
      stroke: var(--color-text-muted);
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    .after {
      stroke: var(--ai-selection, var(--color-accent));
      stroke-width: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathPreviewOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly preview = inject(PathPreview);

  protected readonly shown = computed(() =>
    this.preview.paths().map((p) => {
      const m = multiply(this.toView(), p.toDocument);
      return {
        kind: p.kind,
        d: p.d,
        transform: `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
      };
    }),
  );
}
