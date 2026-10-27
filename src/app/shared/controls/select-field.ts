import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CONTROLS_TEXTS } from './controls-texts';
import { DraftField } from './draft-field';

/**
 * A choice (design 009 E10): the options of the spec; a value that is not among them stays as an
 * extra option (nothing is lost by looking). The first entry "—" = not set (`null`, shows the
 * inherited / default value); "mixed" for a multiple selection with different values. A choice is
 * an edit and its confirmation at once.
 */
@Component({
  selector: 'app-select-field',
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      <select
        class="input"
        [id]="fieldId()"
        [disabled]="disabled()"
        (change)="choose($event)"
        (keydown)="onKey($event)"
      >
        @if (mixed()) {
          <option value="__mixed" disabled [selected]="true">{{ t.mixed }}</option>
        }
        @if (clearable() || value() === null) {
          <option value="__unset" [selected]="!mixed() && value() === null">
            {{ placeholder() ? '— ' + placeholder() : '—' }}
          </option>
        }
        @for (o of choices(); track o) {
          <option [value]="o" [selected]="!mixed() && value() === o">
            {{ optionLabels()[o] ?? o }}
          </option>
        }
      </select>
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectField extends DraftField {
  readonly options = input<readonly string[]>([]);
  /** Offer "—" (not set); off: a value is required (design 010). */
  readonly clearable = input(true);
  /** Display names of options (the value stays the option). */
  readonly optionLabels = input<Readonly<Record<string, string>>>({});
  readonly mixed = input(false);
  protected readonly t = CONTROLS_TEXTS;

  protected readonly choices = computed(() => {
    const v = this.value();
    const o = this.options();
    return v !== null && !o.includes(v) ? [...o, v] : o;
  });

  protected accepts(): boolean {
    return true;
  }

  protected choose(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    if (v === '__mixed') return;
    this.editing.set(true);
    this.edited.emit(v === '__unset' ? null : v);
    this.confirm();
  }
}
