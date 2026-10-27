import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FreehandStore } from './freehand.store';
import { TOOLS_TEXTS } from './tools-texts';

/**
 * Options of the freehand tool in the canvas toolbar (design 013 E6): smoothing (RDP epsilon),
 * stroke width, open/closed and "Done" – shown while the tool is on.
 */
@Component({
  selector: 'app-freehand-options',
  template: `
    <div class="tool" role="group" [attr.aria-label]="t.toolbar" data-testid="freehand-options">
      <strong class="name">{{ t.title }}</strong>
      <label>
        {{ t.smoothing }}
        <input
          class="input num"
          type="number"
          min="0"
          max="20"
          step="0.5"
          data-testid="freehand-epsilon"
          [value]="tool.epsilon()"
          (change)="setNumber($event, 0, 20, tool.epsilon.set)"
        />
      </label>
      <label>
        {{ t.strokeWidth }}
        <input
          class="input num"
          type="number"
          min="1"
          max="64"
          step="1"
          data-testid="freehand-width"
          [value]="tool.strokeWidth()"
          (change)="setNumber($event, 1, 64, tool.strokeWidth.set)"
        />
      </label>
      <label [title]="actions.tooltip('freehand.toggleClosed')">
        <input
          type="checkbox"
          data-testid="freehand-closed"
          [checked]="tool.closed()"
          (change)="onClosed($event)"
        />
        {{ t.closed }}
      </label>
      <button
        type="button"
        class="btn quiet"
        data-testid="freehand-done"
        [title]="actions.tooltip('add.freehand')"
        (click)="tool.toggle(false)"
      >
        {{ t.done }}
      </button>
    </div>
  `,
  styles: `
    .tool {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-3);
      font-size: var(--font-size-small);
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }
    .num {
      width: 4.5em;
      height: 26px;
      font-size: var(--font-size-small);
    }
    .btn {
      height: 26px;
      padding: 0 var(--space-2);
      font-size: var(--font-size-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreehandOptions {
  protected readonly tool = inject(FreehandStore);
  protected readonly actions = inject(ActionService);
  protected readonly t = TOOLS_TEXTS.freehand;

  protected onClosed(e: Event): void {
    this.tool.closed.set((e.target as HTMLInputElement).checked);
  }

  protected setNumber(e: Event, min: number, max: number, set: (v: number) => void): void {
    const el = e.target as HTMLInputElement;
    const v = Number(el.value);
    if (el.value.trim() === '' || !Number.isFinite(v)) return;
    const clamped = Math.min(max, Math.max(min, v));
    set(clamped);
    el.value = String(clamped);
  }
}
