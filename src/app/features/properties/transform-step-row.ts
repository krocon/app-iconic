import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NumberField } from '../../shared/controls/number-field';
import { PROPERTIES_TEXTS } from './properties-texts';
import { displayNumber, hasPivot, normalizedArgs, TransformStep } from './transform-list';

interface ArgField {
  index: number;
  label: string;
  unit?: string;
  step: number;
}

const DEG = { unit: '°', step: 1 };

/** The number fields of each step kind (legacy `TransformSection`). */
function fieldsOf(step: TransformStep): ArgField[] {
  switch (step.kind) {
    case 'translate':
      return [
        { index: 0, label: 'X', step: 1 },
        { index: 1, label: 'Y', step: 1 },
      ];
    case 'scale':
      return [
        { index: 0, label: 'X', step: 0.1 },
        { index: 1, label: 'Y', step: 0.1 },
      ];
    case 'rotate': {
      const angle = { index: 0, label: 'Angle', ...DEG };
      return hasPivot(step)
        ? [angle, { index: 1, label: 'Pivot X', step: 1 }, { index: 2, label: 'Pivot Y', step: 1 }]
        : [angle];
    }
    case 'skewX':
    case 'skewY':
      return [{ index: 0, label: 'Angle', ...DEG }];
    case 'matrix':
      return ['a', 'b', 'c', 'd', 'e', 'f'].map((label, index) => ({
        index,
        label,
        step: index < 4 ? 0.1 : 1,
      }));
  }
}

/**
 * One step of the transform list (design 009 E7): grip (drag, Alt+↑/↓), kind, number fields
 * (rounded to 3 decimals), "Use pivot" for rotate, the lock of scale, ↑ / ↓ / remove.
 */
@Component({
  selector: 'app-transform-step-row',
  imports: [NumberField],
  template: `
    @let s = step();
    <div class="head">
      <button
        type="button"
        class="tool grip"
        [title]="t.dragStep"
        [attr.aria-label]="t.dragStep + ': ' + t.steps[s.kind]"
        (pointerdown)="grab($event)"
        (pointerup)="dragEnd.emit($event)"
        (pointercancel)="dragEnd.emit($event)"
        (keydown)="gripKey($event)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h6M5 8h6M5 12h6" /></svg>
      </button>
      <span class="kind">{{ t.steps[s.kind] }}</span>
      @if (s.kind === 'rotate') {
        <label class="pivot">
          <input
            type="checkbox"
            [checked]="pivoted()"
            (change)="pivot.emit($any($event.target).checked)"
          />
          {{ t.usePivot }}
        </label>
      }
      @if (s.kind === 'scale') {
        <label class="pivot">
          <input
            type="checkbox"
            [checked]="lockScale()"
            (change)="lockScaleChange.emit($any($event.target).checked)"
          />
          {{ t.keepRatio }}
        </label>
      }
      <span class="spacer"></span>
      <button
        type="button"
        class="tool"
        [disabled]="index() === 0"
        [title]="t.moveUp"
        [attr.aria-label]="t.moveUp"
        (click)="move.emit(-1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
      </button>
      <button
        type="button"
        class="tool"
        [disabled]="index() === count() - 1"
        [title]="t.moveDown"
        [attr.aria-label]="t.moveDown"
        (click)="move.emit(1)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      <button
        type="button"
        class="tool"
        [title]="t.removeStep"
        [attr.aria-label]="t.removeStep"
        (click)="remove.emit()"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>
    <div class="args" [class.matrix]="s.kind === 'matrix'">
      @for (f of fields(); track f.index) {
        <app-number-field
          [fieldId]="fieldId() + '-a' + f.index"
          [label]="f.label"
          [value]="values()[f.index]"
          [step]="f.step"
          [unit]="f.unit"
          (edited)="$event !== null && arg.emit({ index: f.index, value: $event })"
          (committed)="commitArg.emit()"
          (reverted)="cancelArg.emit()"
        />
      }
    </div>
  `,
  styleUrl: './transform-editor.css',
  host: { role: 'listitem', class: 'step', '[attr.data-step]': 'index()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformStepRow {
  readonly step = input.required<TransformStep>();
  readonly index = input.required<number>();
  readonly count = input.required<number>();
  readonly fieldId = input.required<string>();
  readonly lockScale = input(false);
  readonly arg = output<{ index: number; value: string }>();
  readonly commitArg = output<void>();
  readonly cancelArg = output<void>();
  readonly pivot = output<boolean>();
  readonly lockScaleChange = output<boolean>();
  readonly move = output<-1 | 1>();
  readonly remove = output<void>();
  readonly dragStart = output<PointerEvent>();
  readonly dragEnd = output<PointerEvent>();
  protected readonly t = PROPERTIES_TEXTS;

  protected readonly fields = computed(() => fieldsOf(this.step()));
  protected readonly values = computed(() => normalizedArgs(this.step()).map(displayNumber));
  protected readonly pivoted = computed(() => hasPivot(this.step()));

  protected grab(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.dragStart.emit(e);
  }

  protected gripKey(e: KeyboardEvent): void {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    this.move.emit(e.key === 'ArrowUp' ? -1 : 1);
  }
}
