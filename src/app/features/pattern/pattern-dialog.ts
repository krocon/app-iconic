import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { MAX_PATTERN_COPIES } from '../../shared/geometry/pattern';
import { parseValue } from '../sketch/sketch-overlay';
import { PatternService } from './pattern.service';
import { PATTERN_TEXTS as T } from './pattern-texts';

type Field = 'count' | 'angle' | 'columns' | 'rows' | 'dx' | 'dy';

const round = (v: number) => String(Math.round(v * 10) / 10);

/**
 * Circular / Rectangular Pattern (prompt 049, like Fusion's dialog): quantity and total angle, or
 * columns, rows and spacing – the copies show live on the canvas; OK keeps them (one undo step),
 * Cancel takes them back.
 */
@Component({
  selector: 'app-pattern-dialog',
  imports: [Modal],
  template: `
    @if (state(); as s) {
      <app-modal
        [heading]="s.kind === 'circular' ? t.circularTitle : t.rectangularTitle"
        width="20rem"
        (closed)="cancel()"
      >
        <form class="form" (submit)="$event.preventDefault(); ok()">
          @for (f of fields(); track f; let first = $first) {
            <label class="row">
              <span>{{ t[f] }}</span>
              <input
                class="input"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                [attr.data-autofocus]="first ? '' : null"
                [attr.data-field]="f"
                [value]="text()[f]"
                (input)="typed(f, $event)"
              />
            </label>
          }
          <p class="error" role="alert">{{ valid() ? '' : t.invalid }}</p>
          <div class="actions">
            <button type="button" class="btn" (click)="cancel()">{{ t.cancel }}</button>
            <button
              type="submit"
              class="btn primary"
              data-testid="pattern-ok"
              [disabled]="!valid()"
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
      grid-template-columns: 7rem 1fr;
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
export class PatternDialog implements OnInit {
  private readonly dialogs = inject(DialogService);
  private readonly service = inject(PatternService);
  protected readonly t = T;
  protected readonly state = this.service.dialog;
  protected readonly fields = computed((): Field[] =>
    this.state()?.kind === 'circular' ? ['count', 'angle'] : ['columns', 'rows', 'dx', 'dy'],
  );
  protected readonly text = signal<Record<Field, string>>(this.defaults());
  private done = false;

  private defaults(): Record<Field, string> {
    const b = this.service.bounds();
    return {
      count: '6',
      angle: '360',
      columns: '3',
      rows: '1',
      dx: round((b?.width ?? 100) * 1.25),
      dy: round((b?.height ?? 100) * 1.25),
    };
  }

  private values(): Record<Field, number> | null {
    const out = {} as Record<Field, number>;
    for (const f of this.fields()) {
      const v = parseValue(this.text()[f]);
      if (v === null) return null;
      out[f] = v;
    }
    return out;
  }

  protected readonly valid = computed(() => {
    const v = this.values();
    if (!v) return false;
    const whole = (x: number, min: number) => Number.isInteger(x) && x >= min;
    if (this.state()?.kind === 'circular') {
      return (
        whole(v.count, 2) &&
        v.count <= MAX_PATTERN_COPIES &&
        v.angle !== 0 &&
        Math.abs(v.angle) <= 360
      );
    }
    return (
      whole(v.columns, 1) &&
      whole(v.rows, 1) &&
      v.columns * v.rows >= 2 &&
      v.columns * v.rows <= MAX_PATTERN_COPIES + 1
    );
  });

  ngOnInit(): void {
    this.update();
  }

  protected typed(f: Field, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.text.update((t) => ({ ...t, [f]: v }));
    this.update();
  }

  private update(): void {
    const s = this.state();
    const v = this.values();
    if (!s || !v || !this.valid()) return;
    if (s.kind === 'circular') {
      this.service.preview({ kind: 'circular', center: s.center, count: v.count, angle: v.angle });
    } else {
      this.service.preview({
        kind: 'rectangular',
        columns: v.columns,
        rows: v.rows,
        dx: v.dx,
        dy: v.dy,
      });
    }
  }

  protected ok(): void {
    if (!this.valid() || this.done) return;
    this.done = true;
    this.service.commitPreview();
    this.service.dialog.set(null);
    this.dialogs.close();
  }

  protected cancel(): void {
    if (this.done) return;
    this.done = true;
    this.service.cancelPreview();
    this.service.dialog.set(null);
    this.dialogs.close();
  }
}
