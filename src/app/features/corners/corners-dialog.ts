import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CORNER_KINDS, CornerKind } from '../../shared/geometry/corners';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { StepperField } from '../../shared/controls/stepper-field';
import { FilesService } from '../files/files.service';
import { parseValue } from '../sketch/sketch-overlay';
import { cornerSource } from './corner-source';
import { CornersService } from './corners.service';
import { CORNERS_TEXTS as T } from './corners-texts';

/**
 * Corners… (prompt 045; a double click on a corner widget, or the Edit menu): radius and kind of
 * the selected nodes' corners, live on the canvas (prompt 073 E4); OK keeps one undo step, Cancel /
 * Esc leave none. A popover: the canvas stays usable.
 */
@Component({
  selector: 'app-corners-dialog',
  imports: [Modal, StepperField],
  template: `
    <app-modal [heading]="t.title" width="20rem" (closed)="cancel()">
      <form class="form" (submit)="$event.preventDefault(); ok()">
        <label class="row">
          <span>{{ t.radius }}</span>
          <app-stepper-field
            data-testid="corners-radius"
            field="radius"
            [autofocus]="true"
            [min]="0"
            [step]="1"
            [value]="radius()"
            (valueChange)="radius.set($event); update()"
          />
        </label>
        <label class="row">
          <span>{{ t.kind }}</span>
          <select
            class="input"
            data-testid="corners-kind"
            (change)="kind.set($any($event.target).value); update()"
          >
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="k === kind()">{{ t.kinds[k] }}</option>
            }
          </select>
        </label>
        <div class="actions">
          <button type="button" class="btn" (click)="cancel()">{{ t.cancel }}</button>
          <button type="submit" class="btn primary" data-testid="corners-ok" [disabled]="!valid()">
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
      min-width: 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CornersDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly actions = inject(ActionService);
  protected readonly t = T;
  protected readonly kinds = CORNER_KINDS;
  private readonly first = (() => {
    const store = inject(FilesService).store();
    for (const r of store?.selection() ?? []) {
      const el = store!.document().node(r);
      const src = el ? cornerSource(el) : null;
      if (src) return src;
    }
    return null;
  })();
  protected readonly radius = signal(String(Math.round((this.first?.radius ?? 10) * 100) / 100));
  protected readonly kind = signal<CornerKind>(this.first?.kind ?? 'round');
  protected readonly valid = computed(() => {
    const v = parseValue(this.radius());
    return v !== null && v >= 0;
  });

  private readonly service = inject(CornersService);
  private previewed = false;

  constructor() {
    // closed some other way: no preview stays behind
    inject(DestroyRef).onDestroy(() => this.service.cancel());
  }

  /** The live preview (prompt 073 E4): every change shows on the canvas at once. */
  protected update(): void {
    const radius = parseValue(this.radius());
    if (radius === null || radius < 0) return;
    this.previewed = true;
    this.service.preview(radius, this.kind());
  }

  protected ok(): void {
    const radius = parseValue(this.radius());
    if (radius === null || radius < 0) return;
    this.dialogs.close();
    if (this.previewed) {
      // the preview shows the current values (each change re-runs it)
      this.service.commit();
      return;
    }
    this.actions.run('corners.set', { radius, kind: this.kind() });
  }

  protected cancel(): void {
    this.service.cancel();
    this.dialogs.close();
  }
}
