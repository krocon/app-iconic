import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { normalizeHex } from '../../shared/controls/color-value';
import { CONTROLS_TEXTS } from '../../shared/controls/controls-texts';
import { DraftField } from '../../shared/controls/draft-field';
import { hexOf, isIconColor, spaceOf, withHex } from './icon-color-text';

/**
 * A colour of `icon.json` (design 010 E8): swatch with the native picker, a text field that takes
 * hex (`#RGB`, `#RRGGBB`, `#RRGGBBAA` – the channels in the file's colour space) or Icon
 * Composer's own form (`display-p3:1,0,0,1`), and the colour space. Emits Apple-format colours.
 */
@Component({
  selector: 'app-icon-color-field',
  template: `
    <label class="label" [for]="fieldId()">{{ label() }}</label>
    <span class="editor">
      <input
        class="swatch"
        type="color"
        [attr.aria-label]="t.pickColor + ': ' + label()"
        [value]="native()"
        [disabled]="disabled()"
        (input)="onPick($event)"
        (change)="confirm()"
      />
      <input
        class="input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        [id]="fieldId()"
        [value]="shown()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [title]="value() ?? ''"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
        (blur)="confirm()"
      />
      <span class="unit" data-testid="color-space">{{ space() }}</span>
    </span>
  `,
  styleUrl: '../../shared/controls/controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconColorField extends DraftField {
  protected readonly t = CONTROLS_TEXTS;
  protected readonly native = computed(() =>
    (hexOf(this.value()) ?? '#000000').slice(0, 7).toLowerCase(),
  );
  protected readonly space = computed(() => spaceOf(this.value()));
  /** Shown as hex – Icon Composer's long form stays in the tooltip. */
  protected override readonly shown = computed(() =>
    this.editing() ? this.draft() : (hexOf(this.value()) ?? this.value() ?? ''),
  );

  protected accepts(text: string): boolean {
    const t = text.trim();
    return t.startsWith('#') ? normalizeHex(t) !== null : isIconColor(t);
  }

  protected override toValue(text: string): string {
    const t = text.trim();
    return t.startsWith('#') ? (withHex(this.value(), t) ?? t) : t;
  }

  protected onPick(e: Event): void {
    const hex = (e.target as HTMLInputElement).value;
    const v = withHex(this.value(), hex);
    if (!v) return;
    this.editing.set(true);
    this.draft.set(hex.toUpperCase());
    this.edited.emit(v);
  }
}
