import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ColorButton } from './color-button';
import { browserColor, COLOR_KEYWORDS, colorKind, normalizeHex } from './color-value';
import { CONTROLS_TEXTS } from './controls-texts';
import { DraftField } from './draft-field';

/**
 * Colour editor (design 009 E10, legacy colour picker): a chip opening the colour popover
 * (prompt 074: area, hue, alpha, formats, swatches, the system picker inside), a hex
 * field (`#RGB`, `#RRGGBB`, `#RRGGBBAA` – other CSS colours and `url(#…)` stay as typed) and a menu
 * of keywords (`none`, `inherit`, `currentColor`). Gradient references show their stops
 * (`swatch` from the caller, e.g. the tree's `swatchOf`). "mixed": hatched swatch.
 */
@Component({
  selector: 'app-color-field',
  imports: [ColorButton],
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      @if (mixed()) {
        <span class="chip mixed" aria-hidden="true"></span>
      } @else if (kind() === 'url' && swatch()) {
        <span
          class="chip"
          [style.background]="swatch()"
          [title]="t.gradient"
          aria-hidden="true"
        ></span>
      } @else if (kind() === 'none') {
        <span class="chip none" aria-hidden="true"></span>
      } @else {
        <app-color-button
          [value]="value()"
          [fallback]="placeholder()"
          [label]="label()"
          [disabled]="disabled()"
          (edited)="onPicked($event)"
          (committed)="confirm()"
          (reverted)="revert()"
        />
      }
      <input
        class="input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        [id]="fieldId()"
        [value]="shown()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (blur)="confirm()"
      />
      <select
        class="input keyword"
        [attr.aria-label]="t.keywords + ': ' + label()"
        [disabled]="disabled()"
        (change)="onKeyword($event)"
      >
        <option value="" selected>{{ t.keywordNone }}</option>
        @for (k of keywords; track k) {
          <option [value]="k">{{ k }}</option>
        }
      </select>
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorField extends DraftField {
  readonly mixed = input(false);
  /** CSS background of a referenced gradient. */
  readonly swatch = input<string | null>(null);
  protected readonly t = CONTROLS_TEXTS;
  protected readonly keywords = COLOR_KEYWORDS;

  /** The colour shown: the value, else the inherited one (placeholder). */
  private readonly effective = computed(() => this.shown() || this.placeholder());
  protected readonly kind = computed(() => colorKind(this.effective()));

  protected accepts(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    if (t.startsWith('#')) return normalizeHex(t) !== null;
    // keywords and references live; other CSS colours only when the browser knows them
    return colorKind(t) !== 'other' || browserColor(t) !== null;
  }

  protected override toValue(text: string): string {
    const t = text.trim();
    return t.startsWith('#') ? normalizeHex(t)! : t;
  }

  /** A live value from the colour popover (prompt 074). */
  protected onPicked(v: string): void {
    this.editing.set(true);
    this.draft.set(v);
    this.edited.emit(v);
  }

  protected onKeyword(e: Event): void {
    const sel = e.target as HTMLSelectElement;
    const k = sel.value;
    sel.value = '';
    if (!k) return;
    this.setDraft(k);
    this.confirm();
  }
}
