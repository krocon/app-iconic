import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PathPreview } from '../canvas/path-preview';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { DEFAULT_EPSILON, DEFAULT_PRECISION } from '../../shared/geometry/path-optimize';
import { SVG_SOURCE_TEXTS } from './svg-source-texts';
import { SvgSourceService } from './svg-source.service';

/**
 * "Optimize Path…" (design 011 E12): tolerance and decimals, a preview of points and characters
 * before / after for the selected paths and their outlines on the canvas (prompt 073 E4: a popover,
 * before dashed, after in the accent), "Optimize" as one undo step.
 */
@Component({
  selector: 'app-optimize-path-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.optimizeTitle" width="26rem" (closed)="dialogs.close()">
      <p class="summary" data-testid="optimize-summary">{{ t.optimizeSummary(stats().paths) }}</p>
      <div class="fields">
        <label class="field" [title]="t.epsilonHint">
          <span>{{ t.epsilon }}</span>
          <input
            class="input"
            type="number"
            min="0"
            max="100"
            step="0.1"
            data-autofocus
            data-testid="optimize-epsilon"
            [value]="epsilon()"
            (input)="onEpsilon($event)"
          />
        </label>
        <label class="field">
          <span>{{ t.precision }}</span>
          <input
            class="input"
            type="number"
            min="0"
            max="6"
            step="1"
            data-testid="optimize-precision"
            [value]="precision()"
            (input)="onPrecision($event)"
          />
        </label>
      </div>
      <table class="preview" data-testid="optimize-preview">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">{{ t.before }}</th>
            <th scope="col">{{ t.after }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{{ t.points }}</th>
            <td>{{ stats().pointsBefore }}</td>
            <td data-testid="optimize-points-after">{{ stats().pointsAfter }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t.characters }}</th>
            <td>{{ stats().charsBefore }}</td>
            <td>{{ stats().charsAfter }}</td>
          </tr>
        </tbody>
      </table>
      <p class="note" role="status">{{ stats().changed ? '' : t.noChange }}</p>
      <div class="actions">
        <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
        <button
          type="button"
          class="btn primary"
          data-testid="optimize-apply"
          [disabled]="!stats().changed"
          (click)="apply()"
        >
          {{ t.optimizeApply }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .summary,
    .note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-small);
    }
    .note {
      min-height: 1.4em;
    }
    .fields {
      display: flex;
      gap: var(--space-3);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      input {
        width: 7rem;
      }
    }
    .preview {
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
      th,
      td {
        padding: var(--space-1) var(--space-3) var(--space-1) 0;
        text-align: right;
      }
      th[scope='row'] {
        text-align: left;
        font-weight: normal;
        color: var(--color-text-muted);
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptimizePathDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly service = inject(SvgSourceService);
  protected readonly t = SVG_SOURCE_TEXTS;
  protected readonly epsilon = signal(DEFAULT_EPSILON);
  protected readonly precision = signal(DEFAULT_PRECISION);
  private readonly revision = computed(() => this.service.store()?.revision() ?? 0);

  protected readonly stats = computed(() => {
    this.revision();
    return this.service.optimizeStats({ epsilon: this.epsilon(), precision: this.precision() });
  });
  private readonly preview = inject(PathPreview);
  private readonly canvas = inject(CanvasViewStore);

  constructor() {
    // before / after as outlines on the canvas (prompt 073 E4) – the document stays as it is
    effect(() => {
      this.revision();
      const opts = { epsilon: this.epsilon(), precision: this.precision() };
      this.preview.show(this.service.optimizeOutlines(opts, this.canvas.host));
    });
    inject(DestroyRef).onDestroy(() => this.preview.clear());
  }

  protected onEpsilon(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v) && v >= 0) this.epsilon.set(Math.min(100, v));
  }

  protected onPrecision(e: Event): void {
    const v = Math.round(Number((e.target as HTMLInputElement).value));
    if (Number.isFinite(v)) this.precision.set(Math.max(0, Math.min(6, v)));
  }

  protected apply(): void {
    this.service.optimize({ epsilon: this.epsilon(), precision: this.precision() });
    this.dialogs.close();
  }
}
