import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { parseTags, SymbolLibraryService } from './symbol-library.service';

/**
 * "Save as Symbol…" (prompt 084, design E12): name and tags of the selection's new symbol in
 * "My Symbols". An error of the backend (no name, nothing a symbol can keep, library full) stays
 * in the dialog.
 */
@Component({
  selector: 'app-save-symbol-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.saveTitle" (closed)="dialogs.close()">
      <form (submit)="$event.preventDefault(); save()">
        <label class="field">
          <span>{{ t.name }}</span>
          <input
            class="input"
            data-autofocus
            data-testid="save-symbol-name"
            maxlength="80"
            required
            [value]="name()"
            (input)="name.set(value($event))"
          />
        </label>
        <label class="field">
          <span>{{ t.tags }}</span>
          <input
            class="input"
            data-testid="save-symbol-tags"
            [placeholder]="t.tagsHint"
            [value]="tags()"
            (input)="tags.set(value($event))"
          />
        </label>
        <p class="hint">{{ t.saveHint }}</p>
        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <div class="actions">
          <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
          <button
            type="submit"
            class="btn primary"
            data-testid="save-symbol-save"
            [disabled]="!name().trim() || busy()"
          >
            {{ t.save }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: var(--font-size-small);
    }
    .hint,
    .error {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .error {
      color: var(--color-error);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveSymbolDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly library = inject(SymbolLibraryService);
  protected readonly t = TOOLS_TEXTS.symbol;
  protected readonly name = signal('');
  protected readonly tags = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    if (!this.name().trim() || this.busy()) return;
    this.busy.set(true);
    const r = await this.library.saveSelection(this.name(), parseTags(this.tags()));
    this.busy.set(false);
    if (r.ok) this.dialogs.close();
    else this.error.set(r.error);
  }
}
