import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { StepperField } from '../../shared/controls/stepper-field';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { Anchor, ANCHORS, Reflect } from '../../shared/geometry/transform-ops';
import { parseValue } from '../sketch/sketch-overlay';
import { TransformRequest, TransformService } from './transform.service';
import { TRANSFORM_TEXTS as T } from './transform-texts';

type Field = 'dx' | 'dy' | 'rotate' | 'sx' | 'sy';

const STEPS: Record<Field, { step: number; min?: number; max?: number; unit?: string }> = {
  dx: { step: 10 },
  dy: { step: 10 },
  rotate: { step: 15, min: -360, max: 360, unit: '°' },
  sx: { step: 10, unit: '%' },
  sy: { step: 10, unit: '%' },
};

/**
 * Transform… (prompt 053, like Illustrator's Transform Each): move, rotate, scale, reflect about a
 * reference point of the selection's box (or each element's own), optionally as a copy – live on
 * the canvas; OK keeps it as one undo step.
 */
@Component({
  selector: 'app-transform-dialog',
  imports: [Modal, StepperField],
  template: `
    <app-modal [heading]="t.title" width="28rem" (closed)="cancel()">
      <form class="form" (submit)="$event.preventDefault(); ok()">
        <fieldset class="group">
          <legend>{{ t.move }}</legend>
          @for (f of moveFields; track f; let first = $first) {
            <label class="row">
              <span>{{ t[f] }}</span>
              <app-stepper-field
                [field]="f"
                [autofocus]="first"
                [step]="steps[f].step"
                [value]="text()[f]"
                (valueChange)="set(f, $event)"
              />
            </label>
          }
        </fieldset>
        <label class="row">
          <span>{{ t.rotate }}</span>
          <app-stepper-field
            field="rotate"
            [step]="15"
            [min]="-360"
            [max]="360"
            unit="°"
            [value]="text().rotate"
            (valueChange)="set('rotate', $event)"
          />
        </label>
        <fieldset class="group">
          <legend>{{ t.scale }}</legend>
          @for (f of scaleFields; track f) {
            <label class="row">
              <span>{{ t[f] }}</span>
              <app-stepper-field
                [field]="f"
                [step]="10"
                unit="%"
                [value]="text()[f]"
                (valueChange)="set(f, $event)"
              />
            </label>
          }
        </fieldset>
        <label class="row">
          <span>{{ t.reflect }}</span>
          <select
            class="input"
            data-field="reflect"
            (change)="reflect.set($any($event.target).value); update()"
          >
            @for (r of reflects; track r) {
              <option [value]="r" [selected]="r === reflect()">{{ t.reflects[r] }}</option>
            }
          </select>
        </label>
        <div class="row">
          <span id="transform-pivot">{{ t.pivot }}</span>
          <div class="proxy" role="radiogroup" aria-labelledby="transform-pivot">
            @for (a of anchors; track a) {
              <button
                type="button"
                class="dot"
                role="radio"
                [attr.aria-checked]="a === pivot()"
                [attr.aria-label]="t.anchors[a]"
                [attr.data-anchor]="a"
                [title]="t.anchors[a]"
                (click)="pivot.set(a); update()"
              ></button>
            }
          </div>
        </div>
        <label class="check">
          <input
            type="checkbox"
            data-field="each"
            [checked]="each()"
            (change)="each.set(!each()); update()"
          />
          {{ t.each }}
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-field="copy"
            [checked]="copy()"
            (change)="copy.set(!copy()); update()"
          />
          {{ t.copy }}
        </label>
        <p class="error" role="alert">{{ request() ? '' : t.invalid }}</p>
        <div class="actions">
          <button type="button" class="btn" (click)="cancel()">{{ t.cancel }}</button>
          <button
            type="submit"
            class="btn primary"
            data-testid="transform-ok"
            [disabled]="!request()"
          >
            {{ t.ok }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      min-width: 0;
    }
    legend {
      padding: 0 var(--space-1);
      color: var(--color-text-muted);
    }
    .row {
      display: grid;
      grid-template-columns: 7rem minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2);
    }
    .row .input {
      width: 100%;
    }
    .proxy {
      display: grid;
      grid-template-columns: repeat(3, 1.4rem);
      gap: 4px;
    }
    .dot {
      width: 1.4rem;
      height: 1.4rem;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 3px;
      background: var(--color-surface);
      cursor: pointer;

      &[aria-checked='true'] {
        background: var(--color-accent);
        border-color: var(--color-accent);
      }
    }
    .check {
      display: flex;
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
export class TransformDialog implements OnInit {
  private readonly dialogs = inject(DialogService);
  private readonly service = inject(TransformService);
  protected readonly t = T;
  protected readonly steps = STEPS;
  protected readonly moveFields: Field[] = ['dx', 'dy'];
  protected readonly scaleFields: Field[] = ['sx', 'sy'];
  protected readonly anchors = ANCHORS;
  protected readonly reflects: readonly Reflect[] = ['none', 'horizontal', 'vertical'];
  private readonly start = this.service.last();
  protected readonly text = signal<Record<Field, string>>({
    dx: '0',
    dy: '0',
    rotate: String(this.start?.spec.rotate ?? 0),
    sx: '100',
    sy: '100',
  });
  protected readonly reflect = signal<Reflect>('none');
  protected readonly pivot = signal<Anchor>(
    typeof this.start?.pivot === 'string' ? this.start.pivot : 'c',
  );
  protected readonly each = signal(this.start?.each ?? false);
  protected readonly copy = signal(this.start?.copy ?? false);
  private done = false;

  protected readonly request = computed((): TransformRequest | null => {
    const v = {} as Record<Field, number>;
    for (const [k, s] of Object.entries(this.text()) as [Field, string][]) {
      const n = parseValue(s);
      if (n === null) return null;
      v[k] = n;
    }
    if (v.sx === 0 || v.sy === 0) return null;
    return {
      spec: {
        dx: v.dx,
        dy: v.dy,
        rotate: v.rotate,
        sx: v.sx / 100,
        sy: v.sy / 100,
        reflect: this.reflect(),
      },
      pivot: this.pivot(),
      each: this.each(),
      copy: this.copy(),
    };
  });

  ngOnInit(): void {
    this.update();
  }

  protected set(f: Field, v: string): void {
    this.text.update((t) => ({ ...t, [f]: v }));
    this.update();
  }

  protected update(): void {
    const r = this.request();
    if (r && !this.done) this.service.preview(r);
  }

  protected ok(): void {
    const r = this.request();
    if (this.done || !r) return;
    this.done = true;
    this.service.commit();
    this.service.last.set(r);
    this.dialogs.close();
  }

  protected cancel(): void {
    if (this.done) return;
    this.done = true;
    this.service.cancel();
    this.dialogs.close();
  }
}
