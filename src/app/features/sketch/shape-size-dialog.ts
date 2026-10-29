import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAX_SIDES, MIN_SIDES, validSides } from '../../shared/geometry/sketch/polygon';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { StepperField } from '../../shared/controls/stepper-field';
import { parseValue } from './sketch-overlay';
import { SketchService, SizeValues } from './sketch.service';
import { SKETCH_TEXTS } from './sketch-texts';

type SizeKey = keyof NonNullable<SizeValues> & keyof typeof SKETCH_TEXTS.size;

/** The fields per drag tool and what they start with. */
const FIELDS: Record<string, readonly SizeKey[]> = {
  dragRect: ['width', 'height'],
  dragEllipse: ['width', 'height'],
  dragPolygon: ['radius', 'sides'],
  dragLine: ['length', 'angle'],
  dragRoundRect: ['width', 'height'],
  dragStar: ['radius', 'sides'],
  dragSpiral: ['radius'],
  dragRectGrid: ['width', 'height'],
  dragPolarGrid: ['width', 'height'],
  dragArc: ['width', 'height'],
};

/** What − / + do per field. */
const STEPS: Record<SizeKey, { step: number; min?: number; max?: number }> = {
  width: { step: 10, min: 0 },
  height: { step: 10, min: 0 },
  radius: { step: 10, min: 0 },
  length: { step: 10, min: 0 },
  sides: { step: 1, min: MIN_SIDES, max: MAX_SIDES },
  angle: { step: 15, min: -360, max: 360 },
};

/**
 * The size of a shape whose tool was clicked without a drag (prompt 041, like the shape dialogs
 * of Marc's VectorCraft): width/height, radius/sides or length/angle; OK places it at the click
 * (rectangle and ellipse by their top left corner, the polygon by its centre) as one undo step.
 */
@Component({
  selector: 'app-shape-size-dialog',
  imports: [Modal, StepperField],
  template: `
    @if (sizing(); as s) {
      <app-modal [heading]="t.size.title[s.tool]" width="24rem" (closed)="cancel()">
        <form class="form" (submit)="$event.preventDefault(); ok()">
          @for (f of fields(); track f; let first = $first) {
            <label class="row">
              <span>{{ t.size[f] }}</span>
              <app-stepper-field
                [field]="f"
                [autofocus]="first"
                [step]="steps[f].step"
                [min]="steps[f].min"
                [max]="steps[f].max"
                [unit]="f === 'angle' ? '°' : ''"
                [value]="text()[f] ?? ''"
                (valueChange)="typed(f, $event)"
              />
            </label>
          }
          <p class="error" role="alert">{{ valid() ? '' : t.size.invalid }}</p>
          <div class="actions">
            <button type="button" class="btn" (click)="cancel()">{{ t.size.cancel }}</button>
            <button type="submit" class="btn primary" data-testid="size-ok" [disabled]="!valid()">
              {{ t.size.ok }}
            </button>
          </div>
        </form>
      </app-modal>
    }
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .row {
      display: grid;
      grid-template-columns: 6rem minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2);
    }
    .error {
      min-height: 1.4em;
      margin: 0;
      color: var(--color-error);
      font-size: var(--font-size-small);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShapeSizeDialog {
  private readonly dialogs = inject(DialogService);
  private readonly service = inject(SketchService);
  protected readonly t = SKETCH_TEXTS;
  protected readonly steps = STEPS;
  protected readonly sizing = this.service.tool.sizing;
  protected readonly fields = computed(() => FIELDS[this.sizing()?.tool ?? ''] ?? []);
  protected readonly text = signal<Partial<Record<SizeKey, string>>>({
    width: '100',
    height: '100',
    radius: '50',
    sides: String(this.service.tool.polygonSides()),
    length: '100',
    angle: '0',
  });

  private readonly values = computed((): SizeValues => {
    const out: Record<string, number> = {};
    for (const f of this.fields()) {
      const v = parseValue(this.text()[f] ?? '');
      if (v !== null) out[f] = v;
    }
    return out;
  });

  protected readonly valid = computed(() =>
    this.fields().every((f) => {
      const v = this.values()[f];
      if (v === undefined) return false;
      if (f === 'angle') return true;
      return f === 'sides' ? validSides(v) : v > 0;
    }),
  );

  protected typed(f: SizeKey, v: string): void {
    this.text.update((t) => ({ ...t, [f]: v }));
  }

  protected ok(): void {
    if (!this.valid()) return;
    const values = this.values();
    this.dialogs.close();
    void this.service.insertSized(values);
  }

  protected cancel(): void {
    this.dialogs.close();
    this.service.tool.sized();
  }
}
