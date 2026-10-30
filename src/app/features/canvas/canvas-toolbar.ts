import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ZOOM_STEPS, zoomPercent } from '../../shared/geometry/zoom-steps';
import { CANVAS_TEXTS } from './canvas-texts';
import { CanvasViewStore } from './canvas-view.store';
import { ViewOptionsMenu } from './view-options-menu';
import { FreehandStore } from '../tools/freehand.store';
import { ConstructionMode } from '../construction/construction-mode';
import { ColorButton } from '../../shared/controls/color-button';
import { browserColor, toHex, toRgba } from '../../shared/controls/color-value';

/**
 * Toolbar of the canvas (design 004 E9/E14, 005 E10): zoom out / level / in, 100 %, Fit, Center –
 * all as actions – the options of the freehand tool while it is on (design 013 E6) and the "View
 * Options" menu with the view toggles, appearance and mask.
 */
@Component({
  selector: 'app-canvas-toolbar',
  imports: [ViewOptionsMenu, ColorButton],
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
      <button
        type="button"
        class="btn quiet construction"
        data-testid="construction-mode"
        [class.on]="construction.on()"
        [attr.aria-pressed]="construction.on()"
        [title]="actions.tooltip('sketch.toggleConstructionMode')"
        (click)="actions.run('sketch.toggleConstructionMode')"
      >
        {{ t.constructionMode }}
      </button>
      <!-- the most used icon switches at one click (prompt 069): the same actions as the menus -->
      @for (g of segments; track g.key) {
        <div
          class="segmented"
          role="radiogroup"
          tabindex="-1"
          [attr.data-testid]="'segment-' + g.key"
          [attr.aria-label]="g.label"
          (keydown)="segmentKey($event, g.items)"
        >
          @for (o of g.items; track o.id) {
            <button
              type="button"
              class="seg"
              role="radio"
              [attr.data-action]="o.id"
              [attr.aria-checked]="actions.checked(o.id) === true"
              [attr.tabindex]="actions.checked(o.id) === true ? 0 : -1"
              [title]="actions.tooltip(o.id)"
              (click)="actions.run(o.id)"
            >
              {{ o.label }}
            </button>
          }
        </div>
        @if (g.key === 'appearance' && view.options().appearance === 'tinted') {
          <!-- the tint of the tinted approximation (prompt 077 E2): a view setting -->
          <app-color-button
            testId="canvas-tint"
            [value]="view.options().tint"
            [label]="t.tint"
            [attr.title]="t.tint"
            (edited)="tint($event)"
          />
        }
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
    .segmented {
      display: inline-flex;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .seg {
      height: 24px;
      padding: 0 var(--space-2);
      border: none;
      border-right: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--font-size-small);
      cursor: pointer;

      &:last-child {
        border-right: none;
      }
      &[aria-checked='true'] {
        background: var(--color-accent);
        color: var(--color-accent-text);
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
    }
    .construction.on {
      color: var(--color-accent-text);
      background: var(--ai-construction);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasToolbar {
  protected readonly view = inject(CanvasViewStore);
  protected readonly actions = inject(ActionService);
  protected readonly freehand = inject(FreehandStore);
  protected readonly construction = inject(ConstructionMode);
  protected readonly t = CANVAS_TEXTS;
  protected readonly steps = ZOOM_STEPS;
  /** Appearance and platform mask as segmented controls (prompt 069). */
  protected readonly segments = [
    {
      key: 'appearance',
      label: this.t.appearance,
      items: [
        { id: 'view.appearance.light', label: this.t.light },
        { id: 'view.appearance.dark', label: this.t.dark },
        { id: 'view.appearance.tinted', label: this.t.tintedShort },
      ],
    },
    {
      key: 'mask',
      label: this.t.mask,
      items: [
        { id: 'view.mask.squircle', label: this.t.maskSquircleShort },
        { id: 'view.mask.circle', label: this.t.maskCircleShort },
        { id: 'view.mask.none', label: this.t.maskNoneShort },
      ],
    },
  ];

  /** A colour from the tint chip → `view.tint` (the action checks it). */
  protected tint(color: string): void {
    const c = toRgba(color, browserColor);
    if (c) this.actions.run('view.tint', { color: toHex({ ...c, a: 1 }) });
  }

  /** APG radio group: ←/→ (↑/↓) choose the neighbour and move the focus with it. */
  protected segmentKey(e: KeyboardEvent, items: readonly { id: string }[]): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const i = items.findIndex((o) => this.actions.checked(o.id) === true);
    const next = items[(Math.max(i, 0) + step + items.length) % items.length];
    this.actions.run(next.id);
    const group = e.currentTarget as HTMLElement;
    queueMicrotask(() => group.querySelector<HTMLElement>(`[data-action="${next.id}"]`)?.focus());
  }
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
