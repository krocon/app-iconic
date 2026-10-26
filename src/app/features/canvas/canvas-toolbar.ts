import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ZOOM_STEPS, zoomPercent } from '../../shared/geometry/zoom-steps';
import { platformHint } from '../files/files-texts';
import { Appearance } from './appearance';
import { CANVAS_TEXTS } from './canvas-texts';
import { CanvasToggle, CanvasViewStore, MaskShape } from './canvas-view.store';

/**
 * Toolbar of the canvas (design 004 E9/E14): zoom out / level / in, 100 %, Fit, Center, the view
 * toggles, platform mask and appearance. Until the menus of prompt 005.
 */
@Component({
  selector: 'app-canvas-toolbar',
  template: `
    <div class="bar" role="toolbar" [attr.aria-label]="t.toolbar">
      <div class="cluster">
        <button
          type="button"
          class="btn quiet icon zoom-out"
          [title]="t.zoomOut + ' ' + hint(t.zoomOutHint)"
          [attr.aria-label]="t.zoomOut"
          (click)="view.zoomOut()"
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
          [title]="t.zoomIn + ' ' + hint(t.zoomInHint)"
          [attr.aria-label]="t.zoomIn"
          (click)="view.zoomIn()"
        >
          +
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="t.actualSize + ' ' + hint(t.actualSizeHint)"
          [attr.aria-label]="t.actualSize"
          (click)="view.actualSize()"
        >
          {{ t.actualSizeShort }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="t.fit"
          [attr.aria-label]="t.fit"
          (click)="view.fit()"
        >
          {{ t.fitShort }}
        </button>
        <button
          type="button"
          class="btn quiet"
          [title]="t.center"
          [attr.aria-label]="t.center"
          (click)="view.center()"
        >
          {{ t.centerShort }}
        </button>
      </div>
      <div class="cluster">
        @for (o of toggles; track o.key) {
          <button
            type="button"
            class="btn quiet toggle"
            [attr.aria-pressed]="opt()[o.key]"
            (click)="view.toggle(o.key)"
          >
            {{ o.label }}
          </button>
        }
      </div>
      <div class="cluster">
        <select
          class="input"
          [attr.aria-label]="t.mask"
          [title]="t.mask"
          (change)="view.set('mask', value($event))"
        >
          @for (m of masks; track m.value) {
            <option [value]="m.value" [selected]="opt().mask === m.value">{{ m.label }}</option>
          }
        </select>
        <select
          class="input"
          [attr.aria-label]="t.appearance"
          [title]="t.appearance"
          (change)="view.set('appearance', value($event))"
        >
          <option value="light" [selected]="opt().appearance === 'light'">{{ t.light }}</option>
          <option value="dark" [selected]="opt().appearance === 'dark'">{{ t.dark }}</option>
        </select>
      </div>
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
    .toggle[aria-pressed='true'] {
      color: var(--color-accent);
      background: var(--color-surface-2);
    }
    .zoom {
      width: 6.5em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasToolbar {
  protected readonly view = inject(CanvasViewStore);
  protected readonly t = CANVAS_TEXTS;
  protected readonly steps = ZOOM_STEPS;
  protected readonly opt = this.view.options;
  protected readonly toggles: { key: CanvasToggle; label: string }[] = [
    { key: 'rulers', label: CANVAS_TEXTS.rulers },
    { key: 'guides', label: CANVAS_TEXTS.guides },
    { key: 'background', label: CANVAS_TEXTS.background },
    { key: 'crossCursor', label: CANVAS_TEXTS.crossCursor },
  ];
  protected readonly masks: { value: MaskShape; label: string }[] = [
    { value: 'squircle', label: CANVAS_TEXTS.maskSquircle },
    { value: 'circle', label: CANVAS_TEXTS.maskCircle },
    { value: 'none', label: CANVAS_TEXTS.maskNone },
  ];
  protected readonly onStep = computed(() => ZOOM_STEPS.some((s) => this.isZoom(s)));
  protected readonly zoomValue = computed(() => String(this.view.zoom()));
  protected readonly percent = computed(() => zoomPercent(this.view.zoom()));
  private readonly mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

  protected isZoom(s: number): boolean {
    return Math.abs(s - this.view.zoom()) < 1e-6;
  }

  protected pct(z: number): string {
    return zoomPercent(z);
  }

  protected hint(text: string): string {
    return platformHint(text, this.mac);
  }

  protected value<T extends MaskShape | Appearance>(e: Event): T {
    return (e.target as HTMLSelectElement).value as T;
  }

  protected onZoom(e: Event): void {
    this.view.zoomTo(Number((e.target as HTMLSelectElement).value));
  }
}
