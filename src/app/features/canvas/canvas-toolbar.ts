import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ZOOM_STEPS, zoomPercent } from '../../shared/geometry/zoom-steps';
import { CANVAS_TEXTS } from './canvas-texts';
import { CanvasViewStore } from './canvas-view.store';
import { ViewOptionsMenu } from './view-options-menu';
import { FreehandOptions } from '../tools/freehand-options';
import { FreehandStore } from '../tools/freehand.store';

/**
 * Toolbar of the canvas (design 004 E9/E14, 005 E10): zoom out / level / in, 100 %, Fit, Center –
 * all as actions – the options of the freehand tool while it is on (design 013 E6) and the "View
 * Options" menu with the view toggles, appearance and mask.
 */
@Component({
  selector: 'app-canvas-toolbar',
  imports: [FreehandOptions, ViewOptionsMenu],
  template: `
    <div class="bar" role="toolbar" [attr.aria-label]="t.toolbar">
      <div class="cluster">
        <button
          type="button"
          class="btn quiet icon zoom-out"
          [title]="actions.tooltip('view.zoomOut')"
          [attr.aria-label]="t.zoomOut"
          (click)="actions.run('view.zoomOut')"
        >
          −
        </button>
        <select class="input zoom" [attr.aria-label]="t.zoomLevel" (change)="onZoom($event)">
          @if (!onStep()) {
            <option [value]="zoomValue()" selected>{{ percent() }}</option>
          }
          @for (s of steps; track s) {
            <option [value]="s" [selected]="isZoom(s)">{{ pct(s) }}</option>
          }
        </select>
        <button
          type="button"
          class="btn quiet icon zoom-in"
          [title]="actions.tooltip('view.zoomIn')"
          [attr.aria-label]="t.zoomIn"
          (click)="actions.run('view.zoomIn')"
        >
          +
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="actions.tooltip('view.actualSize')"
          [attr.aria-label]="t.actualSize"
          (click)="actions.run('view.actualSize')"
        >
          {{ t.actualSizeShort }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="actions.tooltip('view.zoomToFit')"
          [attr.aria-label]="t.fit"
          (click)="actions.run('view.zoomToFit')"
        >
          {{ t.fitShort }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="actions.tooltip('view.centerCanvas')"
          [attr.aria-label]="t.center"
          (click)="actions.run('view.centerCanvas')"
        >
          {{ t.centerShort }}
        </button>
      </div>
      @if (freehand.active()) {
        <app-freehand-options />
      }
      <span class="spacer"></span>
      <app-view-options-menu />
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-3);
      padding: var(--space-1) var(--space-2);
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
    }
    .cluster {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .btn,
    .input {
      height: 26px;
      font-size: var(--font-size-small);
    }
    .btn {
      padding: 0 var(--space-2);
    }
    .icon {
      min-width: 26px;
      font-size: var(--font-size);
    }
    .spacer {
      flex: 1;
    }
    .zoom {
      width: 6.5em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasToolbar {
  protected readonly view = inject(CanvasViewStore);
  protected readonly actions = inject(ActionService);
  protected readonly freehand = inject(FreehandStore);
  protected readonly t = CANVAS_TEXTS;
  protected readonly steps = ZOOM_STEPS;
  protected readonly opt = this.view.options;
  protected readonly onStep = computed(() => ZOOM_STEPS.some((s) => this.isZoom(s)));
  protected readonly zoomValue = computed(() => String(this.view.zoom()));
  protected readonly percent = computed(() => zoomPercent(this.view.zoom()));

  protected isZoom(s: number): boolean {
    return Math.abs(s - this.view.zoom()) < 1e-6;
  }

  protected pct(z: number): string {
    return zoomPercent(z);
  }

  protected onZoom(e: Event): void {
    this.actions.run('view.zoomTo', { zoom: Number((e.target as HTMLSelectElement).value) });
  }
}
