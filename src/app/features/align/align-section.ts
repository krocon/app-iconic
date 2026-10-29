import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { StepperField } from '../../shared/controls/stepper-field';
import { ALIGN_MODES } from '../../shared/geometry/align';
import { FilesService } from '../files/files.service';
import { ALIGN_TO, AlignTo } from '../hierarchy/align';
import { parseValue } from '../sketch/sketch-overlay';
import { DISTRIBUTE } from './align-actions';
import { AlignService } from './align.service';
import { ALIGN_TEXTS as T } from './align-texts';

/** 16 × 16 outlines of the buttons. */
const ICONS: Record<string, string> = {
  'arrange.align.left': 'M2.5 1.5v13 M4.5 4h8v3h-8z M4.5 9h5v3h-5z',
  'arrange.align.centerH': 'M8 1.5v13 M3.5 4h9v3h-9z M5 9h6v3H5z',
  'arrange.align.right': 'M13.5 1.5v13 M3.5 4h8v3h-8z M6.5 9h5v3h-5z',
  'arrange.align.top': 'M1.5 2.5h13 M4 4.5v8h3v-8z M9 4.5v5h3v-5z',
  'arrange.align.middle': 'M1.5 8h13 M4 3.5v9h3v-9z M9 5v6h3V5z',
  'arrange.align.bottom': 'M1.5 13.5h13 M4 3.5v8h3v-8z M9 6.5v5h3v-5z',
  'arrange.distribute.horizontalCenters':
    'M3 2v12 M8 2v12 M13 2v12 M1.5 6h3v4h-3z M6.5 5h3v6h-3z M11.5 6.5h3v3h-3z',
  'arrange.distribute.verticalCenters':
    'M2 3h12 M2 8h12 M2 13h12 M6 1.5h4v3H6z M5 6.5h6v3H5z M6.5 11.5h3v3h-3z',
  'arrange.distribute.horizontalGaps':
    'M1.5 4h3v8h-3z M6.5 5h3v6h-3z M11.5 3h3v10h-3z M4.5 8h2 M9.5 8h2',
  'arrange.distribute.verticalGaps':
    'M4 1.5h8v3H4z M5 6.5h6v3H5z M3 11.5h10v3H3z M8 4.5v2 M8 9.5v2',
};

/**
 * The "Align" section of the properties panel (prompt 054): align buttons, align to selection /
 * canvas / key object, distribute centres and gaps, a fixed gap – all as actions.
 */
@Component({
  selector: 'app-align-section',
  imports: [StepperField],
  template: `
    @if (visible()) {
      <section class="section" data-section="align" data-testid="align-section">
        <h3 class="section-title">{{ t.section }}</h3>
        <div class="buttons" role="group" [attr.aria-label]="t.section">
          @for (id of alignIds; track id) {
            <button
              type="button"
              class="icon-btn"
              [attr.data-action]="id"
              [attr.aria-label]="actions.label(id)"
              [title]="actions.tooltip(id)"
              [disabled]="!actions.enabled(id)"
              (click)="actions.run(id)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path [attr.d]="icons[id]" /></svg>
            </button>
          }
        </div>
        <div class="rows">
          <label class="label" for="align-to">{{ t.alignTo }}</label>
          <select id="align-to" class="input" data-testid="align-to" (change)="setTo($event)">
            @for (o of toList; track o) {
              <option [value]="o" [selected]="o === align.to()">{{ t.to[o] }}</option>
            }
          </select>
          @if (align.to() === 'key') {
            <p class="info">{{ t.keyHint }}</p>
          }
        </div>
        <h4 class="sub">{{ t.distribute }}</h4>
        <div class="buttons" role="group" [attr.aria-label]="t.distribute">
          @for (id of distributeIds; track id) {
            <button
              type="button"
              class="icon-btn"
              [attr.data-action]="id"
              [attr.aria-label]="actions.label(id)"
              [title]="actions.tooltip(id)"
              [disabled]="!actions.enabled(id)"
              (click)="actions.run(id)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path [attr.d]="icons[id]" /></svg>
            </button>
          }
        </div>
        <div class="rows">
          <span class="label">{{ t.spacing }}</span>
          <div class="spacing">
            <app-stepper-field
              field="gap"
              [label]="t.spacing"
              [step]="1"
              [value]="gapText()"
              (valueChange)="setGap($event)"
            />
            <button
              type="button"
              class="icon-btn"
              data-testid="space-h"
              [title]="t.spaceH"
              [attr.aria-label]="t.spaceH"
              (click)="space('horizontal')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path [attr.d]="icons['arrange.distribute.horizontalGaps']" />
              </svg>
            </button>
            <button
              type="button"
              class="icon-btn"
              data-testid="space-v"
              [title]="t.spaceV"
              [attr.aria-label]="t.spaceV"
              (click)="space('vertical')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path [attr.d]="icons['arrange.distribute.verticalGaps']" />
              </svg>
            </button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .section {
      border-bottom: 1px solid var(--color-border);
      padding-bottom: var(--space-2);
    }
    .section-title,
    .sub {
      margin: 0;
      padding: var(--space-2) 0;
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .sub {
      text-transform: none;
      letter-spacing: 0;
      padding-bottom: var(--space-1);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      padding-bottom: var(--space-1);
    }
    .icon-btn {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 26px;
      padding: 0;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;

      &:hover:not(:disabled) {
        border-color: var(--color-accent);
      }
      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
      svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.1;
      }
    }
    .rows {
      display: grid;
      grid-template-columns: 6.5rem minmax(0, 1fr);
      gap: var(--space-1) var(--space-2);
      align-items: center;
      font-size: var(--font-size-small);
    }
    .input {
      min-width: 0;
    }
    .info {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--color-text-muted);
    }
    .spacing {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      min-width: 0;

      app-stepper-field {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlignSection {
  protected readonly actions = inject(ActionService);
  protected readonly align = inject(AlignService);
  private readonly files = inject(FilesService);
  protected readonly t = T;
  protected readonly icons = ICONS;
  protected readonly toList = ALIGN_TO;
  protected readonly alignIds = ALIGN_MODES.map((m) => `arrange.align.${m}`);
  protected readonly distributeIds = DISTRIBUTE.map((d) => d.id);
  protected readonly gapText = computed(() => String(this.align.gap()));
  protected readonly visible = computed(() => (this.files.store()?.selection().length ?? 0) > 0);

  protected setTo(e: Event): void {
    const v = (e.target as HTMLSelectElement).value as AlignTo;
    this.actions.run(`arrange.alignTo.${v}`);
  }

  protected setGap(v: string): void {
    const n = parseValue(v);
    if (n !== null) this.align.gap.set(n);
  }

  protected space(axis: 'horizontal' | 'vertical'): void {
    this.actions.run('arrange.distribute.spacing', { axis, gap: this.align.gap() });
  }
}
