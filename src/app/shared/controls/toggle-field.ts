import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DraftField } from './draft-field';

/** A switch (design 009 E10; `vector-effect`): checked = `on`, unchecked = `off`. */
@Component({
  selector: 'app-toggle-field',
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      <input
        class="check"
        type="checkbox"
        [id]="fieldId()"
        [checked]="(value() ?? placeholder()) === on()"
        [indeterminate]="mixed()"
        [disabled]="disabled()"
        (change)="toggle($event)"
      />
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleField extends DraftField {
  readonly on = input('true');
  readonly off = input('false');
  readonly mixed = input(false);

  protected accepts(): boolean {
    return true;
  }

  protected toggle(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.editing.set(true);
    this.edited.emit(checked ? this.on() : this.off());
    this.confirm();
  }
}
