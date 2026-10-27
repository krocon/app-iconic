import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ExportAppearance, PNG_SIZES, PngSize } from '../../core/export/export.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { MaskShape } from '../canvas/canvas-view.store';
import { APPEARANCES, choiceReady, ExportFormat, fileCount, MASKS } from './export-options';
import { ExportOutcome, ExportService, noticeOf } from './export.service';
import { EXPORT_TEXTS } from './export-texts';

type Phase = 'edit' | 'running' | 'exists' | 'result';

/**
 * File › Export… (design 012 E16): format, appearances, sizes (PNG), mask, effects and target
 * folder – the last choice is remembered (E15). While PNGs render: progress and "Stop"; existing
 * files: inline question (E11); afterwards the result with the Apple hint (E13).
 */
@Component({
  selector: 'app-export-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="32rem" (closed)="close()">
      <fieldset class="group" [disabled]="phase() === 'running'">
        <legend>{{ t.format }}</legend>
        <div class="row">
          @for (f of formats; track f) {
            <label class="check">
              <input
                type="radio"
                name="export-format"
                [attr.data-testid]="'export-format-' + f"
                [checked]="choice().format === f"
                [attr.data-autofocus]="choice().format === f ? '' : null"
                (change)="service.update({ format: f })"
              />
              {{ t.formats[f] }}
            </label>
          }
        </div>
      </fieldset>
      <fieldset class="group" [disabled]="phase() === 'running'">
        <legend>{{ t.appearances }}</legend>
        <div class="row">
          @for (a of appearances; track a) {
            <label class="check">
              <input
                type="checkbox"
                [attr.data-testid]="'export-appearance-' + a"
                [checked]="choice().appearances.includes(a)"
                (change)="toggleAppearance(a)"
              />
              {{ a === 'light' ? t.light : t.dark }}
            </label>
          }
        </div>
      </fieldset>
      @if (choice().format === 'png') {
        <fieldset class="group" [disabled]="phase() === 'running'">
          <legend>{{ t.sizes }}</legend>
          <div class="row wrap">
            @for (s of sizes; track s) {
              <label class="check">
                <input
                  type="checkbox"
                  [attr.data-testid]="'export-size-' + s"
                  [checked]="choice().sizes.includes(s)"
                  (change)="toggleSize(s)"
                />
                {{ s }}
              </label>
            }
          </div>
        </fieldset>
      }
      <div class="fields">
        <label class="field">
          <span>{{ t.mask }}</span>
          <select
            class="input"
            data-testid="export-mask"
            [disabled]="phase() === 'running'"
            (change)="setMask($event)"
          >
            @for (m of masks; track m) {
              <option [value]="m" [selected]="choice().mask === m">{{ t.masks[m] }}</option>
            }
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-testid="export-effects"
            [disabled]="phase() === 'running'"
            [checked]="choice().effects"
            (change)="service.update({ effects: !choice().effects })"
          />
          {{ t.effects }}
        </label>
        <div class="field">
          <span id="export-target-label">{{ t.target }}</span>
          <div class="target">
            <span
              class="path"
              data-testid="export-target"
              aria-labelledby="export-target-label"
              [title]="choice().targetDir ?? ''"
              ><bdi>{{ choice().targetDir ?? t.noTarget }}</bdi></span
            >
            <button
              type="button"
              class="btn"
              data-testid="export-choose"
              [disabled]="phase() === 'running'"
              (click)="service.chooseDir()"
            >
              {{ t.choose }}
            </button>
          </div>
        </div>
      </div>
      <div class="status" role="status" aria-live="polite">
        @switch (phase()) {
          @case ('running') {
            @if (service.progress(); as p) {
              <progress data-testid="export-progress" [max]="p.total" [value]="p.done"></progress>
              <span>{{ t.progress(p.done, p.total) }}</span>
            } @else {
              <progress data-testid="export-progress"></progress>
            }
          }
          @case ('exists') {
            <p data-testid="export-exists">{{ t.exists }}</p>
          }
          @case ('result') {
            <p data-testid="export-result">{{ resultText() }}</p>
            @if (warning()) {
              <p class="warning" data-testid="export-warning">{{ t.transparentWarning }}</p>
            }
          }
          @default {
            <p class="count">{{ t.files(count()) }}</p>
          }
        }
      </div>
      <div class="actions" #actions>
        @switch (phase()) {
          @case ('running') {
            <button type="button" class="btn" data-testid="export-stop" (click)="service.cancel()">
              {{ t.stop }}
            </button>
          }
          @case ('exists') {
            <button type="button" class="btn" (click)="setPhase('edit')">{{ t.cancel }}</button>
            <button
              type="button"
              class="btn primary"
              data-testid="export-replace"
              (click)="run(true)"
            >
              {{ t.replace }}
            </button>
          }
          @default {
            <button type="button" class="btn" (click)="close()">
              {{ phase() === 'result' ? t.close : t.cancel }}
            </button>
            <button
              type="button"
              class="btn primary"
              data-testid="export-run"
              [disabled]="!ready()"
              (click)="run(false)"
            >
              {{ t.export }}
            </button>
          }
        }
      </div>
    </app-modal>
  `,
  styles: `
    .group {
      margin: 0 0 var(--space-3);
      padding: 0;
      border: 0;
      & legend {
        margin-bottom: var(--space-1);
        font-weight: 600;
      }
    }
    .row {
      display: flex;
      gap: var(--space-3);
      &.wrap {
        flex-wrap: wrap;
      }
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }
    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .target {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .path {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: var(--color-text-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
      /* rtl: a long path is cut at its start, the folder name stays visible; <bdi> keeps it ltr */
      direction: rtl;
      text-align: left;
    }
    .status {
      min-height: 3.2em;
      margin: var(--space-3) 0 var(--space-2);
      & p {
        margin: 0 0 var(--space-1);
      }
      & progress {
        width: 70%;
        margin-right: var(--space-2);
        vertical-align: middle;
      }
    }
    .count {
      color: var(--color-text-muted);
    }
    .warning {
      color: var(--color-warning);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  protected readonly service = inject(ExportService);
  private readonly dialogs = inject(DialogService);
  protected readonly t = EXPORT_TEXTS;
  protected readonly formats: readonly ExportFormat[] = ['png', 'svg'];
  protected readonly appearances = APPEARANCES;
  protected readonly sizes = PNG_SIZES;
  protected readonly masks = MASKS;

  protected readonly choice = this.service.choice;
  protected readonly phase = signal<Phase>('edit');
  private readonly outcome = signal<ExportOutcome | null>(null);
  protected readonly count = computed(() => fileCount(this.choice()));
  protected readonly ready = computed(
    () => choiceReady(this.choice()) && !!this.choice().targetDir && this.service.canExport(),
  );
  protected readonly resultText = computed(() => {
    const o = this.outcome();
    return o ? (o.kind === 'done' ? this.t.done(o.report.files.length) : noticeOf(o)) : '';
  });
  protected readonly warning = computed(() => {
    const o = this.outcome();
    return o?.kind === 'done' && o.transparentWarning;
  });

  protected toggleAppearance(a: ExportAppearance): void {
    const list = this.choice().appearances;
    const next = list.includes(a) ? list.filter((x) => x !== a) : [...list, a];
    this.service.update({ appearances: APPEARANCES.filter((x) => next.includes(x)) });
  }

  protected toggleSize(s: PngSize): void {
    const list = this.choice().sizes;
    const next = list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
    this.service.update({ sizes: PNG_SIZES.filter((x) => next.includes(x)) });
  }

  protected setMask(e: Event): void {
    this.service.update({ mask: (e.target as HTMLSelectElement).value as MaskShape });
  }

  private readonly actionsEl = viewChild.required<ElementRef<HTMLElement>>('actions');

  protected async run(overwrite: boolean): Promise<void> {
    this.setPhase('running');
    const o = await this.service.export({ ...this.choice(), overwrite });
    this.outcome.set(o);
    this.setPhase(o.kind === 'exists' ? 'exists' : 'result');
  }

  /**
   * The focused button disappears with the phase – the focus stays in the dialog, on the first
   * button (Stop, Cancel or Close – never Replace or Export by an accidental Enter).
   */
  protected setPhase(p: Phase): void {
    this.phase.set(p);
    setTimeout(() => {
      this.actionsEl().nativeElement.querySelector('button')?.focus();
    });
  }

  protected close(): void {
    // Esc / Cancel while PNGs render stop the export; the dialog closes when it has stopped
    if (this.phase() === 'running') {
      this.service.cancel();
      return;
    }
    this.dialogs.close();
  }
}
