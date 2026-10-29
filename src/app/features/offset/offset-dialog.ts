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
import { LineJoin } from '../../shared/geometry/pathops/offset';
import { parseValue } from '../sketch/sketch-overlay';
import { OffsetOptions, OffsetService } from './offset.service';
import { OFFSET_TEXTS as T } from './offset-texts';

/**
 * Offset Path… (prompt 052): distance (− / +), corners and whether the original goes – the result
 * shows live on the canvas; OK keeps it as one undo step, Cancel takes it back.
 */
@Component({
  selector: 'app-offset-dialog',
  imports: [Modal, StepperField],
  template: `
    <app-modal [heading]="t.title" width="26rem" (closed)="cancel()">
      <form class="form" (submit)="$event.preventDefault(); ok()">
        <label class="row">
          <span>{{ t.distance }}</span>
          <app-stepper-field
            field="distance"
            [autofocus]="true"
            [step]="1"
            [value]="text()"
            (valueChange)="text.set($event); update()"
          />
        </label>
        <label class="row">
          <span>{{ t.join }}</span>
          <select
            class="input"
            data-field="join"
            (change)="join.set($any($event.target).value); update()"
          >
            @for (j of joins; track j) {
              <option [value]="j" [selected]="j === join()">{{ t.joins[j] }}</option>
            }
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-field="replace"
            [checked]="replace()"
            (change)="replace.set(!replace()); update()"
          />
          {{ t.replace }}
        </label>
        <p class="hint">{{ t.hint }}</p>
        <p class="error" role="alert">{{ error() }}</p>
        <div class="actions">
          <button type="button" class="btn" (click)="cancel()">{{ t.cancel }}</button>
          <button type="submit" class="btn primary" data-testid="offset-ok" [disabled]="!!error()">
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
    .row {
      display: grid;
      grid-template-columns: 6rem minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2);
    }
    .row .input {
      width: 100%;
    }
    .check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-small);
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
export class OffsetDialog implements OnInit {
  private readonly dialogs = inject(DialogService);
  private readonly service = inject(OffsetService);
  protected readonly t = T;
  protected readonly joins: readonly LineJoin[] = ['miter', 'round', 'bevel'];
  private readonly start = this.service.last();
  protected readonly text = signal(String(this.start.distance));
  protected readonly join = signal<LineJoin>(this.start.join);
  protected readonly replace = signal(this.start.replace);
  protected readonly error = signal<string | null>(null);
  private readonly options = computed((): OffsetOptions | null => {
    const d = parseValue(this.text());
    return d === null || d === 0
      ? null
      : { distance: d, join: this.join(), replace: this.replace() };
  });
  private done = false;
  private seq = 0;

  ngOnInit(): void {
    this.update();
  }

  protected async update(): Promise<void> {
    const o = this.options();
    if (this.done) return;
    if (!o) {
      this.error.set(T.invalid);
      return;
    }
    const seq = ++this.seq;
    const ok = await this.service.preview(o);
    if (seq === this.seq && !this.done) this.error.set(ok ? null : T.nothing);
  }

  protected ok(): void {
    const o = this.options();
    if (this.done || !o || this.error()) return;
    this.done = true;
    this.service.commit(o);
    this.dialogs.close();
  }

  protected cancel(): void {
    if (this.done) return;
    this.done = true;
    this.service.cancel();
    this.dialogs.close();
  }
}
