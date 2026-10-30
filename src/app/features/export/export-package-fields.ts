import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { WEB_MANIFEST, WEB_SNIPPET } from './export-android-web';
import { ExportService } from './export.service';
import { EXPORT_TEXTS } from './export-texts';

/**
 * The fields of the Android and web packages in the export dialog (prompt 079): the monochrome
 * layer and per group foreground / background (E4); the `<link>` tags and the manifest's icons
 * to copy (E8, text clipboard through `ClipboardApi`). Own component – the dialog stays small.
 */
@Component({
  selector: 'app-export-package-fields',
  template: `
    @if (format() === 'android') {
      <fieldset class="group" [disabled]="disabled()">
        <legend>{{ t.layers }}</legend>
        <label class="check">
          <input
            type="checkbox"
            data-testid="export-monochrome"
            [checked]="choice().monochrome"
            (change)="service.update({ monochrome: !choice().monochrome })"
          />
          {{ t.monochrome }}
        </label>
        <div class="layers">
          @for (g of service.groupChoices(); track g.index) {
            <span [id]="'export-layer-label-' + g.index" [title]="g.label">{{ g.label }}</span>
            <select
              class="input"
              [attr.data-testid]="'export-layer-' + g.index"
              [attr.aria-labelledby]="'export-layer-label-' + g.index"
              (change)="setLayer(g.index, $event)"
            >
              <option value="foreground" [selected]="!background().has(g.index)">
                {{ t.layerNames.foreground }}
              </option>
              <option value="background" [selected]="background().has(g.index)">
                {{ t.layerNames.background }}
              </option>
            </select>
          } @empty {
            <span>{{ t.noGroups }}</span>
          }
        </div>
        <p class="hint">{{ t.layersHint }}</p>
      </fieldset>
    }
    @if (format() === 'web') {
      @for (c of copies; track c.id) {
        <div class="group">
          <div class="copy-head">
            <span [id]="'export-copy-label-' + c.id">{{ t[c.id] }}</span>
            <button
              type="button"
              class="btn"
              [attr.data-testid]="'export-copy-' + c.id"
              [attr.aria-label]="t.copyLabel(t[c.id])"
              (click)="copy(c.text)"
            >
              {{ t.copy }}
            </button>
          </div>
          <pre
            class="code"
            tabindex="0"
            [attr.data-testid]="'export-text-' + c.id"
            [attr.aria-labelledby]="'export-copy-label-' + c.id"
            >{{ c.text }}</pre>
        </div>
      }
      <p class="hint" role="status" aria-live="polite" data-testid="export-copied">
        {{ copied() }}
      </p>
    }
  `,
  styleUrl: './export-package-fields.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPackageFields {
  protected readonly service = inject(ExportService);
  private readonly clipboard = inject(ClipboardApi);
  protected readonly t = EXPORT_TEXTS;
  readonly disabled = input(false);

  protected readonly choice = this.service.choice;
  protected readonly format = computed(() => this.choice().format);
  protected readonly background = computed(() => new Set(this.choice().backgroundGroups));
  protected readonly copied = signal('');
  protected readonly copies = [
    { id: 'snippet', text: WEB_SNIPPET },
    { id: 'manifest', text: WEB_MANIFEST },
  ] as const;

  protected setLayer(index: number, e: Event): void {
    const toBackground = (e.target as HTMLSelectElement).value === 'background';
    const rest = this.choice().backgroundGroups.filter((i) => i !== index);
    const next = toBackground ? [...rest, index] : rest;
    this.service.update({ backgroundGroups: next.sort((a, b) => a - b) });
  }

  protected async copy(text: string): Promise<void> {
    try {
      await this.clipboard.writeText(text);
      this.copied.set(this.t.textCopied);
    } catch {
      this.copied.set(this.t.textCopyFailed);
    }
  }
}
