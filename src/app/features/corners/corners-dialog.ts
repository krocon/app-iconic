import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CORNER_KINDS, CornerKind } from '../../shared/geometry/corners';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { FilesService } from '../files/files.service';
import { parseValue } from '../sketch/sketch-overlay';
import { cornerSource } from './corner-source';
import { CORNERS_TEXTS as T } from './corners-texts';

/**
 * Corners… (prompt 045; a double click on a corner widget, or the Edit menu): radius and kind of
 * the selected nodes' corners, through `corners.set` (one undo step).
 */
@Component({
  selector: 'app-corners-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="20rem" (closed)="dialogs.close()">
      <form class="form" (submit)="$event.preventDefault(); ok()">
        <label class="row">
          <span>{{ t.radius }}</span>
          <input
            class="input"
            type="text"
            inputmode="decimal"
            data-autofocus
            data-testid="corners-radius"
            [value]="radius()"
            (input)="radius.set($any($event.target).value)"
          />
        </label>
        <label class="row">
          <span>{{ t.kind }}</span>
          <select
            class="input"
            data-testid="corners-kind"
            (change)="kind.set($any($event.target).value)"
          >
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="k === kind()">{{ t.kinds[k] }}</option>
            }
          </select>
        </label>
        <div class="actions">
          <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
          <button type="submit" class="btn primary" [disabled]="!valid()">{{ t.ok }}</button>
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
      grid-template-columns: 5rem 1fr;
      align-items: center;
      gap: var(--space-2);
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

  protected ok(): void {
    const radius = parseValue(this.radius());
    if (radius === null || radius < 0) return;
    this.dialogs.close();
    this.actions.run('corners.set', { radius, kind: this.kind() });
  }
}
