import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { AddService } from './add.service';
import { COMMANDS_TEXTS } from './commands-texts';
import { snippetElements } from './svg-snippet';

/**
 * "Add › SVG Snippet…" (design 008 E9; legacy: "Paste SVG markup to append"): a text area with a
 * live error, "Add" only for valid markup; Esc / Cancel close without change.
 */
@Component({
  selector: 'app-svg-snippet-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.snippetTitle" width="40rem" (closed)="dialogs.close()">
      <label class="field">
        <span>{{ t.snippetLabel }}</span>
        <textarea
          class="input markup"
          rows="10"
          spellcheck="false"
          data-autofocus
          data-testid="snippet-markup"
          [attr.aria-invalid]="!!error()"
          [attr.aria-describedby]="error() ? 'snippet-error' : null"
          [placeholder]="t.snippetPlaceholder"
          [value]="markup()"
          (input)="onInput($event)"
        ></textarea>
      </label>
      <p id="snippet-error" class="error" role="alert">{{ error() }}</p>
      <div class="actions">
        <button type="button" class="btn" (click)="dialogs.close()">{{ t.snippetCancel }}</button>
        <button
          type="button"
          class="btn primary"
          data-testid="snippet-add"
          [disabled]="!valid()"
          (click)="add()"
        >
          {{ t.snippetAdd }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .markup {
      width: 100%;
      height: auto;
      min-height: 12rem;
      padding: var(--space-2);
      font-family: var(--font-mono);
      font-size: var(--font-size-small);
      resize: vertical;
    }
    .error {
      min-height: 1.4em;
      margin: 0;
      color: var(--color-error);
      font-size: var(--font-size-small);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgSnippetDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly addService = inject(AddService);
  protected readonly t = COMMANDS_TEXTS;
  protected readonly markup = signal('');
  private readonly failed = signal(false);

  private readonly parsed = computed(() => snippetElements(this.markup()));
  protected readonly valid = computed(() => !('error' in this.parsed()));
  /** No error for an empty field (nothing typed yet). */
  protected readonly error = computed(() => {
    if (this.failed()) return this.t.addFailed;
    const p = this.parsed();
    return 'error' in p && this.markup().trim() ? this.t.snippetErrors[p.error] : '';
  });

  protected onInput(e: Event): void {
    this.failed.set(false);
    this.markup.set((e.target as HTMLTextAreaElement).value);
  }

  protected async add(): Promise<void> {
    if (!this.valid()) return;
    const result = await this.addService.addSnippet(this.markup());
    if (result) this.failed.set(result === 'failed');
    else this.dialogs.close();
  }
}
