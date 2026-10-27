import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  browserColor,
  COLOR_KEYWORDS,
  colorKind,
  nativeValue,
  normalizeHex,
  withPicked,
} from './color-value';
import { CONTROLS_TEXTS } from './controls-texts';
import { DraftField } from './draft-field';

/**
 * Colour editor (design 009 E10, legacy colour picker): the native colour picker as swatch, a hex
 * field (`#RGB`, `#RRGGBB`, `#RRGGBBAA` – other CSS colours and `url(#…)` stay as typed) and a menu
 * of keywords (`none`, `inherit`, `currentColor`). Gradient references show their stops
 * (`swatch` from the caller, e.g. the tree's `swatchOf`). "mixed": hatched swatch.
 */
@Component({
  selector: 'app-color-field',
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
        <input
          class="swatch"
          type="color"
          [attr.aria-label]="t.pickColor + ': ' + label()"
          [value]="native()"
          [disabled]="disabled()"
          (input)="onPick($event)"
          (change)="confirm()"
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
  protected readonly native = computed(() => nativeValue(this.effective(), browserColor));

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

  protected onPick(e: Event): void {
    this.editing.set(true);
    const v = withPicked(this.value() ?? this.placeholder(), (e.target as HTMLInputElement).value);
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
