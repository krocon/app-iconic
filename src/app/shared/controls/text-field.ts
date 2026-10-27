import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DraftField } from './draft-field';

/**
 * Text and text area (design 009 E10; `d`, `points`): live edits while typing (an empty field is
 * not written until confirmed – then it is `''`, the caller decides). In the text area Enter makes
 * a new line, ⌘/Ctrl+Enter confirms.
 */
@Component({
  selector: 'app-text-field',
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      @if (multiline()) {
        <textarea
          class="input"
          rows="3"
          spellcheck="false"
          [id]="fieldId()"
          [value]="shown()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [readOnly]="readonly()"
          (input)="onInput($event)"
          (keydown)="areaKey($event)"
          (blur)="leave()"
        ></textarea>
      } @else {
        <input
          class="input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          [id]="fieldId()"
          [value]="shown()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [readOnly]="readonly()"
          [title]="readonly() ? placeholder() : ''"
          (input)="onInput($event)"
          (keydown)="key($event)"
          (blur)="leave()"
        />
      }
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextField extends DraftField {
  readonly multiline = input(false);
  readonly readonly = input(false);

  protected accepts(text: string): boolean {
    return text.trim() !== '';
  }

  /** An emptied field is written on confirm (`''`). */
  private flushEmpty(): void {
    if (this.editing() && this.draft().trim() === '') this.edited.emit('');
  }

  protected key(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.flushEmpty();
    this.onKey(e);
  }

  protected areaKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) return;
    this.key(e);
  }

  protected leave(): void {
    this.flushEmpty();
    this.confirm();
  }
}
