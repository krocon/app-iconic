import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { parseTags, SymbolLibraryService } from './symbol-library.service';
import { PickerItem } from './symbol-picker-model';

/**
 * The management of "My Symbols" in the picker (prompt 084, design E14): rename (name + tags,
 * inline), delete (with an inline confirmation – it cannot be undone), import and export a folder.
 */
@Component({
  selector: 'app-my-symbols-bar',
  template: `
    @if (editing(); as e) {
      <form class="edit" (submit)="$event.preventDefault(); saveRename(e.id)">
        <label class="field">
          <span>{{ t.name }}</span>
          <input
            class="input"
            data-testid="my-symbol-name"
            maxlength="80"
            [value]="e.name"
            (input)="name.set(value($event))"
          />
        </label>
        <label class="field">
          <span>{{ t.tags }}</span>
          <input
            class="input"
            data-testid="my-symbol-tags"
            [placeholder]="t.tagsHint"
            [value]="e.tags"
            (input)="tags.set(value($event))"
          />
        </label>
        <button type="submit" class="btn primary" data-testid="my-symbol-save">{{ t.save }}</button>
        <button type="button" class="btn" (click)="editing.set(null)">{{ t.cancel }}</button>
      </form>
    } @else if (confirming(); as c) {
      <div class="row" role="group">
        <span>{{ t.confirmDelete(c.name) }}</span>
        <button type="button" class="btn" data-testid="my-symbol-confirm" (click)="doDelete(c.id)">
          {{ t.yesDelete }}
        </button>
        <button type="button" class="btn" (click)="confirming.set(null)">{{ t.cancel }}</button>
      </div>
    } @else {
      <div class="row">
        <button
          type="button"
          class="btn"
          data-testid="my-symbol-rename"
          [disabled]="!item()"
          (click)="startRename()"
        >
          {{ t.rename }}
        </button>
        <button
          type="button"
          class="btn"
          data-testid="my-symbol-delete"
          [disabled]="!item()"
          (click)="confirming.set(item())"
        >
          {{ t.delete }}
        </button>
        <span class="spacer"></span>
        <button
          type="button"
          class="btn"
          data-testid="my-symbol-import"
          (click)="library.importFolder()"
        >
          {{ t.importFolder }}
        </button>
        <button
          type="button"
          class="btn"
          data-testid="my-symbol-export"
          (click)="library.exportFolder()"
        >
          {{ t.exportFolder }}
        </button>
      </div>
    }
    @if (error(); as err) {
      <p class="error" role="alert">{{ err }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: var(--space-2);
    }
    .row,
    .edit {
      display: flex;
      gap: var(--space-2);
      align-items: end;
      flex-wrap: wrap;
    }
    .row {
      align-items: center;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: var(--font-size-small);
    }
    .spacer {
      flex: 1;
    }
    .error {
      margin: var(--space-1) 0 0;
      color: var(--color-error);
      font-size: var(--font-size-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySymbolsBar {
  protected readonly library = inject(SymbolLibraryService);
  protected readonly t = TOOLS_TEXTS.symbol;
  readonly item = input<PickerItem | null>(null);
  /** The library changed (the picker keeps its place). */
  readonly changed = output<void>();
  protected readonly editing = signal<{ id: string; name: string; tags: string } | null>(null);
  protected readonly confirming = signal<PickerItem | null>(null);
  protected readonly name = signal('');
  protected readonly tags = signal('');
  protected readonly error = signal<string | null>(null);

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected startRename(): void {
    const i = this.item();
    if (!i) return;
    const tags = i.tags.join(', ');
    this.name.set(i.name);
    this.tags.set(tags);
    this.error.set(null);
    this.editing.set({ id: i.id, name: i.name, tags });
  }

  protected async saveRename(id: string): Promise<void> {
    const r = await this.library.rename(id, this.name(), parseTags(this.tags()));
    if (!r.ok) {
      this.error.set(r.error);
      return;
    }
    this.error.set(null);
    this.editing.set(null);
    this.changed.emit();
  }

  protected async doDelete(id: string): Promise<void> {
    const r = await this.library.remove(id);
    this.confirming.set(null);
    this.error.set(r.ok ? null : r.error);
    this.changed.emit();
  }
}
