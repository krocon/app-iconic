import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { CONTROLS_TEXTS } from './controls-texts';
import { DraftField } from './draft-field';

/** A small picture of an option: a stroked path, or a filled one with its fill rule. */
export interface SegmentIcon {
  d: string;
  fill?: 'nonzero' | 'evenodd';
}

/**
 * A choice as icon toggles (prompt 073 E2, APG radio group): one button per option with a small
 * picture, the option's name as label and the SVG term as tooltip. ← / → / ↑ / ↓ move and choose
 * (roving tab index), Space / Enter / click choose. Not set (`null`): no option is checked, the
 * inherited / default one is outlined; mixed: none is checked either. Choosing is an edit and its
 * confirmation at once, like `SelectField`.
 */
@Component({
  selector: 'app-segmented-field',
  template: `
    <span class="label" [id]="fieldId() + '-label'">{{ label() }}</span>
    <span class="editor">
      <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
      <span
        class="segments"
        role="radiogroup"
        [attr.aria-labelledby]="fieldId() + '-label'"
        [attr.data-mixed]="mixed() ? '' : null"
        (keydown)="onArrow($event)"
      >
        @for (o of options(); track o; let i = $index) {
          <button
            type="button"
            role="radio"
            class="segment"
            [id]="i === 0 ? fieldId() : null"
            [attr.data-option]="o"
            [attr.aria-checked]="!mixed() && value() === o"
            [attr.aria-label]="optionLabels()[o] ?? o"
            [title]="(optionLabels()[o] ?? o) + ' – ' + o"
            [class.fallback]="!mixed() && value() === null && placeholder() === o"
            [tabindex]="i === focusIndex() ? 0 : -1"
            [disabled]="disabled()"
            (click)="pick(o)"
          >
            @if (icons()[o]; as ic) {
              <svg viewBox="0 0 16 16" aria-hidden="true" [class.filled]="!!ic.fill">
                <path [attr.d]="ic.d" [attr.fill-rule]="ic.fill ?? null" />
              </svg>
            } @else {
              <span class="text">{{ optionLabels()[o] ?? o }}</span>
            }
          </button>
        }
      </span>
      @if (mixed()) {
        <span class="unit">{{ t.mixed }}</span>
      }
    </span>
  `,
  styleUrl: './controls.css',
  styles: `
    .segments {
      display: inline-flex;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .segment {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 22px;
      padding: 0 var(--space-1);
      color: var(--color-text);
      background: var(--color-surface);
      border: 0;
      border-left: 1px solid var(--color-border);
      font: inherit;
      font-size: var(--font-size-small);
      &:first-child {
        border-left: 0;
      }
      &:hover:not(:disabled) {
        background: var(--color-hover);
      }
      &[aria-checked='true'] {
        color: var(--color-accent-text);
        background: var(--color-accent);
      }
      &.fallback {
        box-shadow: inset 0 0 0 1px var(--color-text-muted);
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
      svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.4;
        stroke-linecap: butt;
        stroke-linejoin: miter;
        &.filled {
          fill: currentColor;
          stroke: none;
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedField extends DraftField {
  readonly options = input<readonly string[]>([]);
  readonly optionLabels = input<Readonly<Record<string, string>>>({});
  readonly icons = input<Readonly<Record<string, SegmentIcon>>>({});
  readonly mixed = input(false);
  protected readonly t = CONTROLS_TEXTS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The option with tab index 0: the checked one, else the fallback, else the first. */
  protected readonly focusIndex = computed(() => {
    const o = this.options();
    const v = this.mixed() ? null : this.value();
    const i = o.indexOf(v ?? this.placeholder());
    return i >= 0 ? i : 0;
  });

  protected accepts(): boolean {
    return true;
  }

  protected pick(o: string): void {
    if (!this.mixed() && this.value() === o) return;
    this.editing.set(true);
    this.edited.emit(o);
    this.confirm();
  }

  protected onArrow(e: KeyboardEvent): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const o = this.options();
    const at = o.indexOf((e.target as HTMLElement).dataset['option'] ?? '');
    const next = (Math.max(0, at) + step + o.length) % o.length;
    this.pick(o[next]);
    const buttons = this.host.nativeElement.querySelectorAll<HTMLElement>('.segment');
    setTimeout(() => buttons[next]?.focus());
  }
}
