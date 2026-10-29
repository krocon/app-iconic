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
import { FilletError } from '../../shared/geometry/pathops/fillet';
import { parseValue } from '../sketch/sketch-overlay';
import { FilletService } from './fillet.service';
import { FILLET_TEXTS as T } from './fillet-texts';

/**
 * Radius (fillet) or distance (chamfer) of the picked corner (prompt 051): live on the canvas,
 * OK keeps it as one undo step, Cancel takes it back.
 */
@Component({
  selector: 'app-fillet-dialog',
  imports: [Modal, StepperField],
  template: `
    @if (job(); as j) {
      <app-modal [heading]="t.titles[j.kind]" width="24rem" (closed)="cancel()">
        <form class="form" (submit)="$event.preventDefault(); ok()">
          <label class="row">
            <span>{{ j.kind === 'fillet' ? t.radius : t.distance }}</span>
            <app-stepper-field
              field="size"
              [autofocus]="true"
              [min]="0"
              [step]="1"
              [value]="text()"
              (valueChange)="typed($event)"
            />
          </label>
          <p class="error" role="alert" data-testid="fillet-error">
            {{ error() ? t.errors[error()!] : '' }}
          </p>
          <div class="actions">
            <button type="button" class="btn" (click)="cancel()">{{ t.cancel }}</button>
            <button
              type="submit"
              class="btn primary"
              data-testid="fillet-ok"
              [disabled]="!!error()"
            >
              {{ t.ok }}
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
export class FilletDialog implements OnInit {
  private readonly dialogs = inject(DialogService);
  private readonly service = inject(FilletService);
  protected readonly t = T;
  protected readonly job = this.service.job;
  protected readonly text = signal(String(this.service.size()));
  protected readonly error = signal<FilletError | null>(null);
  private readonly value = computed(() => parseValue(this.text()));
  private done = false;

  async ngOnInit(): Promise<void> {
    await this.service.ready();
    this.update();
  }

  protected typed(v: string): void {
    this.text.set(v);
    this.update();
  }

  private update(): void {
    const j = this.job();
    const r = this.value();
    if (!j || this.done) return;
    if (r === null || !(r > 0)) {
      this.error.set('tooLarge');
      return;
    }
    this.error.set(this.service.preview(j, r));
  }

  protected ok(): void {
    const r = this.value();
    if (this.done || this.error() || r === null) return;
    this.done = true;
    this.service.size.set(r);
    this.service.commit();
    this.service.job.set(null);
    this.dialogs.close();
  }

  protected cancel(): void {
    if (this.done) return;
    this.done = true;
    this.service.cancel();
    this.service.job.set(null);
    this.dialogs.close();
  }
}
