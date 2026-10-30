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
import { ColorButton } from '../../shared/controls/color-button';
import { browserColor, toHex, toRgba } from '../../shared/controls/color-value';
import { MaskShape } from '../canvas/canvas-view.store';
import { APPEARANCES, choiceReady, fileCount, FORMATS, MASKS } from './export-options';
import { AppIconPlatform, isPackage, PLATFORMS } from './export-packages';
import { ExportOutcome, ExportService, noticeOf } from './export.service';
import { EXPORT_TEXTS } from './export-texts';
import { ExportPackageFields } from './export-package-fields';

type Phase = 'edit' | 'running' | 'exists' | 'result';

/**
 * File › Export… (design 012 E16): format (078: also Xcode icon set, `.icns`, `.ico` with their
 * platforms; 079: Android layers, web snippets in `ExportPackageFields`), appearances, sizes (PNG), mask, effects and target folder – the last choice is remembered (E15). While PNGs render: progress and "Stop"; existing
 * files: inline question (E11); afterwards the result with the Apple hint (E13).
 */
@Component({
  selector: 'app-export-dialog',
  imports: [Modal, ColorButton, ExportPackageFields],
  template: `
    <app-modal [heading]="t.title" width="32rem" (closed)="close()">
      <fieldset class="group" [disabled]="phase() === 'running'">
        <legend>{{ t.format }}</legend>
        <div class="row wrap">
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
        @if (hint(); as h) {
          <p class="hint" data-testid="export-format-hint">{{ h }}</p>
        }
      </fieldset>
      @if (choice().format === 'appiconset') {
        <fieldset class="group" [disabled]="phase() === 'running'">
          <legend>{{ t.platforms }}</legend>
          <div class="row wrap">
            @for (p of platforms; track p) {
              <label class="check">
                <input
                  type="checkbox"
                  [attr.data-testid]="'export-platform-' + p"
                  [checked]="choice().platforms.includes(p)"
                  (change)="togglePlatform(p)"
                />
                {{ t.platformNames[p] }}
              </label>
            }
          </div>
        </fieldset>
      }
      <app-export-package-fields [disabled]="phase() === 'running'" />
      @if (showAppearances()) {
        <fieldset class="group" [disabled]="phase() === 'running'">
          <legend>{{ isSet() ? t.appearancesIos : t.appearances }}</legend>
          <div class="row">
            @for (a of appearances; track a) {
              <label class="check">
                <!-- the icon set always has the default (light) image -->
                <input
                  type="checkbox"
                  [attr.data-testid]="'export-appearance-' + a"
                  [checked]="choice().appearances.includes(a) || (isSet() && a === 'light')"
                  [disabled]="isSet() && a === 'light'"
                  (change)="toggleAppearance(a)"
                />
                {{ t.appearanceNames[a] }}
              </label>
            }
            @if (choice().appearances.includes('tinted') && !isSet()) {
              <!-- tint of the tinted approximation (prompt 077 E2): not part of the document -->
              <span class="check">
                <app-color-button
                  testId="export-tint"
                  [value]="choice().tint"
                  [label]="t.tint"
                  [disabled]="phase() === 'running'"
                  (edited)="setTint($event)"
                />
                {{ t.tint }}
              </span>
            }
          </div>
        </fieldset>
      }
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
        @if (showMask()) {
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
        }
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
        <label class="check">
          <input
            type="checkbox"
            data-testid="export-dimensions"
            [disabled]="phase() === 'running'"
            [checked]="choice().dimensions"
            (change)="service.update({ dimensions: !choice().dimensions })"
          />
          {{ t.dimensions }}
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
            @if (phase() === 'result' && service.lastExport()) {
              <button
                type="button"
                class="btn"
                data-testid="export-reveal"
                (click)="service.reveal()"
              >
                {{ t.reveal }}
              </button>
            }
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
  styleUrl: './export-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  protected readonly service = inject(ExportService);
  private readonly dialogs = inject(DialogService);
  protected readonly t = EXPORT_TEXTS;
  protected readonly formats = FORMATS;
  protected readonly platforms = PLATFORMS;
  protected readonly appearances = APPEARANCES;
  protected readonly sizes = PNG_SIZES;
  protected readonly masks = MASKS;

  protected readonly choice = this.service.choice;
  protected readonly phase = signal<Phase>('edit');
  private readonly outcome = signal<ExportOutcome | null>(null);
  protected readonly count = computed(() => fileCount(this.choice()));
  protected readonly isSet = computed(() => this.choice().format === 'appiconset');
  /** `.icns` and `.ico` are always Light (design 078 E9). */
  protected readonly showAppearances = computed(
    () => !isPackage(this.choice().format) || this.isSet(),
  );
  /** The icon set, `.icns` and Android bring their own masks (078 E3/E4, 079 E3). */
  protected readonly showMask = computed(() => {
    const f = this.choice().format;
    return !isPackage(f) || f === 'ico' || f === 'web';
  });
  protected readonly hint = computed(() => {
    const f = this.choice().format;
    return isPackage(f) ? this.t.formatHints[f] : null;
  });
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

  protected togglePlatform(p: AppIconPlatform): void {
    const list = this.choice().platforms;
    const next = list.includes(p) ? list.filter((x) => x !== p) : [...list, p];
    this.service.update({ platforms: PLATFORMS.filter((x) => next.includes(x)) });
  }

  protected setTint(color: string): void {
    const c = toRgba(color, browserColor);
    if (c) this.service.update({ tint: toHex({ ...c, a: 1 }) });
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
