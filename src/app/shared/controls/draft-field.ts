import { computed, Directive, input, output, signal } from '@angular/core';

/**
 * The common behaviour of the property editors (design 009 E4, E10): while the user types, the
 * field shows the draft (the model does not overwrite it); every valid draft is emitted live
 * (`edited`), Enter / blur confirm (`committed`), Escape takes it back (`reverted`). Generic – no document
 * knowledge; the caller turns the outputs into a gesture.
 */
@Directive()
export abstract class DraftField {
  /** Element id of the editor (the label points at it). */
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  /** The current value (`null` = not set). */
  readonly value = input<string | null>(null);
  /** Shown when there is no value: inherited / default, or "mixed". */
  readonly placeholder = input('');
  readonly disabled = input(false);

  /** A new value to show live (`null` = remove). */
  readonly edited = output<string | null>();
  readonly committed = output<void>();
  readonly reverted = output<void>();

  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  /** What the text field shows. */
  protected readonly shown = computed(() => (this.editing() ? this.draft() : (this.value() ?? '')));

  /** Is `text` a value that may be shown live? (`''` never is.) */
  protected abstract accepts(text: string): boolean;

  /** The value written for an accepted text (e.g. normalised hex). */
  protected toValue(text: string): string {
    return text.trim();
  }

  protected onInput(e: Event): void {
    const text = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.setDraft(text);
  }

  /** A new draft (typed, stepped, dragged); emitted when acceptable. */
  protected setDraft(text: string): void {
    this.editing.set(true);
    this.draft.set(text);
    if (this.accepts(text)) this.edited.emit(this.toValue(text));
  }

  protected confirm(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    this.committed.emit();
  }

  protected revert(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    this.reverted.emit();
  }

  /** Enter confirms, Escape reverts (the keyboard dispatcher rests in text fields, 005 E4). */
  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      this.confirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.revert();
    }
  }
}
