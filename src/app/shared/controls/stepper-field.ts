import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnDestroy,
  output,
} from '@angular/core';
import { CONTROLS_TEXTS as T } from './controls-texts';
import { readNumber, stepText } from './step-value';

/** Held button: first repeat after, then every (ms). */
const HOLD_DELAY = 400;
const HOLD_EVERY = 70;

/**
 * A number field with − and + buttons (Marc, 29.10.2026; like Fusion's quantity field): a click
 * steps by `step`, holding the button repeats, ↑/↓ step in the field (⇧ × 10); clamped to
 * `min`…`max`. The field stays free text (the dialog checks it); the value goes out as text.
 * A spin button for assistive technology.
 */
@Component({
  selector: 'app-stepper-field',
  template: `
    <div class="stepper">
      <button
        type="button"
        class="step"
        tabindex="-1"
        data-step="down"
        [attr.aria-label]="t.decrease"
        [title]="t.decrease"
        [disabled]="atMin()"
        (pointerdown)="hold($event, -1)"
        (pointerup)="release()"
        (pointerleave)="release()"
        (pointercancel)="release()"
      >
        −
      </button>
      <input
        class="input"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck="false"
        role="spinbutton"
        [attr.aria-label]="label() || null"
        [attr.aria-valuenow]="number()"
        [attr.aria-valuemin]="min() ?? null"
        [attr.aria-valuemax]="max() ?? null"
        [attr.data-field]="field() || null"
        [attr.data-autofocus]="autofocus() ? '' : null"
        [value]="value()"
        (input)="valueChange.emit($any($event.target).value)"
        (keydown)="key($event)"
      />
      @if (unit()) {
        <span class="unit" aria-hidden="true">{{ unit() }}</span>
      }
      <button
        type="button"
        class="step"
        tabindex="-1"
        data-step="up"
        [attr.aria-label]="t.increase"
        [title]="t.increase"
        [disabled]="atMax()"
        (pointerdown)="hold($event, 1)"
        (pointerup)="release()"
        (pointerleave)="release()"
        (pointercancel)="release()"
      >
        +
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      min-width: 0;
    }
    .input {
      flex: 1;
      min-width: 0;
      width: 100%;
      text-align: right;
    }
    .unit {
      color: var(--color-text-muted);
    }
    .step {
      flex: none;
      width: var(--control-height);
      height: var(--control-height);
      padding: 0;
      font: inherit;
      font-size: 1.1em;
      line-height: 1;
      color: var(--color-text);
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;
      touch-action: none;
      user-select: none;

      &:hover:not(:disabled) {
        background: var(--color-surface-3, var(--color-surface-2));
        border-color: var(--color-accent);
      }
      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepperField implements OnDestroy {
  readonly value = input('');
  readonly step = input(1);
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  /** Shown after the field (°, px). */
  readonly unit = input('');
  /** Accessible name when no `<label>` wraps it. */
  readonly label = input('');
  /** `data-field` of the input (tests, the dialog). */
  readonly field = input('');
  readonly autofocus = input(false);
  readonly valueChange = output<string>();
  protected readonly t = T;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly number = computed(() => readNumber(this.value(), false)?.n ?? null);
  protected readonly atMin = computed(() => {
    const n = this.number();
    const m = this.min();
    return n !== null && m !== undefined && n <= m;
  });
  protected readonly atMax = computed(() => {
    const n = this.number();
    const m = this.max();
    return n !== null && m !== undefined && n >= m;
  });

  /** `delta` steps from the current text (an empty / bad text starts at `min` or 0). */
  stepBy(delta: number): void {
    const range = { min: this.min(), max: this.max(), step: this.step() };
    const next = stepText(this.value(), delta, range, false, this.min() ?? 0);
    if (next !== this.value()) this.valueChange.emit(next);
  }

  protected key(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    this.stepBy((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
  }

  protected hold(e: PointerEvent, dir: 1 | -1): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.release();
    const n = e.shiftKey ? 10 : 1;
    this.stepBy(dir * n);
    const again = () => {
      this.stepBy(dir * n);
      this.timer = setTimeout(again, HOLD_EVERY);
    };
    this.timer = setTimeout(again, HOLD_DELAY);
  }

  protected release(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.release();
  }
}
