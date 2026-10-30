import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DraftField } from './draft-field';

/**
 * A font family (prompt 075 E1): a combobox – the field with the installed families as its list
 * (`<datalist>`: typing filters, the system picks), the value shown in its own font. Any CSS
 * family list may be typed (`"SF Pro", sans-serif`). Live edits like a text field; `focused`
 * tells the caller to load the families.
 */
@Component({
  selector: 'app-font-field',
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      <input
        class="input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        [id]="fieldId()"
        [attr.list]="listId()"
        [value]="shown()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [style.font-family]="shown() || placeholder() || null"
        (focus)="focused.emit()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (change)="confirm()"
        (blur)="confirm()"
      />
      <datalist [id]="listId()">
        @for (f of families(); track f) {
          <option [value]="f"></option>
        }
      </datalist>
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontField extends DraftField {
  readonly families = input<readonly string[]>([]);
  readonly focused = output<void>();
  protected readonly listId = computed(() => `${this.fieldId()}-fonts`);

  protected accepts(text: string): boolean {
    return text.trim() !== '';
  }
}
