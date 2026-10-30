import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CONTROLS_TEXTS } from './controls-texts';
import { DraftField } from './draft-field';
import { readNumber, stepText } from './step-value';

/** Pixels of pointer movement per step when dragging the label. */
const DRAG_PX = 2;

/**
 * Number with a stepped slider (design 009 E10, legacy `SteppedSlider`): the slider only when the
 * range is closed (min and max), the number field always; ↑/↓ ± step, ⇧ × 10; dragging the label
 * left/right steps too (⇧ × 10). `units`: a length – `50%` keeps its unit. Typing, stepping and
 * dragging are live edits; Enter / blur / release confirm, Escape reverts.
 */
@Component({
  selector: 'app-number-field',
  template: `
    <label
      class="label drag"
      [for]="fieldId()"
      [title]="t.dragHint"
      (pointerdown)="dragStart($event)"
      (pointermove)="dragMove($event)"
      (pointerup)="dragEnd($event)"
      (pointercancel)="dragCancel()"
      >{{ label() }}</label
    >
    <span class="editor">
      @if (ranged()) {
        <input
          class="slider"
          type="range"
          tabindex="-1"
          aria-hidden="true"
          [min]="min()!"
          [max]="max()!"
          [step]="step()"
          [value]="sliderValue()"
          [disabled]="disabled()"
          (input)="onSlider($event)"
          (change)="confirm()"
        />
      }
      <input
        class="input"
        type="text"
        inputmode="decimal"
        spellcheck="false"
        autocomplete="off"
        [id]="fieldId()"
        [value]="shown()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [attr.aria-valuemin]="min()"
        [attr.aria-valuemax]="max()"
        (input)="onInput($event)"
        (keydown)="key($event)"
        (blur)="confirm()"
      />
      @if (unit()) {
        <span class="unit">{{ unit() }}</span>
      }
    </span>
  `,
  styleUrl: './controls.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NumberField extends DraftField {
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly step = input(1);
  readonly unit = input<string | undefined>(undefined);
  /** A length: a unit may follow the number. */
  readonly units = input(false);
  /** Without the slider (half a row, prompt 073 E1). */
  readonly compact = input(false);
  protected readonly t = CONTROLS_TEXTS;

  protected readonly ranged = computed(
    () => !this.compact() && this.min() !== undefined && this.max() !== undefined,
  );
  protected readonly sliderValue = computed(() => {
    const n = readNumber(this.shown(), this.units())?.n ?? readNumber(this.placeholder(), true)?.n;
    return n ?? this.min() ?? 0;
  });

  private drag: { x: number; base: string; moved: boolean; id: number } | null = null;

  protected accepts(text: string): boolean {
    return readNumber(text, this.units()) !== null;
  }

  private range() {
    return { min: this.min(), max: this.max(), step: this.step() };
  }

  /** The text a step starts from: the draft / value, else the placeholder (inherited value). */
  private current(): string {
    const s = this.shown();
    return readNumber(s, this.units()) ? s : this.placeholder();
  }

  protected key(e: KeyboardEvent): void {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      this.setDraft(stepText(this.current(), delta, this.range(), this.units()));
      return;
    }
    this.onKey(e);
  }

  protected onSlider(e: Event): void {
    const n = Number((e.target as HTMLInputElement).value);
    const unit = readNumber(this.current(), this.units())?.unit ?? '';
    this.setDraft(stepText(String(n), 0, this.range(), this.units()) + unit);
  }

  protected dragStart(e: PointerEvent): void {
    if (this.disabled() || e.button !== 0) return;
    this.drag = { x: e.clientX, base: this.current(), moved: false, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  protected dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const steps = Math.trunc((e.clientX - d.x) / DRAG_PX);
    if (!d.moved && steps === 0) return;
    d.moved = true;
    e.preventDefault();
    this.setDraft(stepText(d.base, steps * (e.shiftKey ? 10 : 1), this.range(), this.units()));
  }

  protected dragEnd(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (d?.moved) {
      e.preventDefault();
      this.confirm();
    }
  }

  protected dragCancel(): void {
    if (this.drag?.moved) this.revert();
    this.drag = null;
  }
}
