import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { NumberField } from '../../shared/controls/number-field';
import { BoxEdit, frameFields } from '../../shared/geometry/box-frame';
import { Anchor, ANCHORS } from '../../shared/geometry/transform-ops';
import { DocumentStore } from '../document/document.store';
import { TRANSFORM_TEXTS } from '../transform/transform-texts';
import { BoxService } from './box.service';
import { PROPERTIES_TEXTS } from './properties-texts';

/** A number for a field: at most two decimals, no "-0". */
export function boxNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** The anchor the arrow key leads to in the 3 × 3 proxy (wraps like an APG radio group). */
export function nextAnchor(a: Anchor, key: string): Anchor | null {
  const i = ANCHORS.indexOf(a);
  const step = { ArrowRight: 1, ArrowDown: 3, ArrowLeft: -1, ArrowUp: -3 }[key];
  if (step === undefined) return null;
  return ANCHORS[(i + step + 9) % 9];
}

/**
 * The box head of the properties panel (prompt 062): X, Y of the reference point, W, H (with the
 * proportions lock), rotation, flips and the reference point – for any SVG selection, measured in
 * document units (1024 × 1024). One element: its own (rotated) frame, absolute rotation; several or
 * a skewed one: the box around all, rotation relative ("Rotate by").
 */
@Component({
  selector: 'app-box-section',
  imports: [NumberField],
  template: `
    @if (box.state(); as st) {
      @let f = fields()!;
      <section class="section box" data-testid="box-section" [attr.aria-label]="t.box.title">
        <div class="grid">
          <app-number-field
            fieldId="box-x"
            [label]="t.box.x"
            [value]="num(f.x)"
            [disabled]="st.locked"
            (edited)="edit('x', $event)"
            (committed)="box.commit()"
            (reverted)="box.cancel()"
          />
          <app-number-field
            fieldId="box-y"
            [label]="t.box.y"
            [value]="num(f.y)"
            [disabled]="st.locked"
            (edited)="edit('y', $event)"
            (committed)="box.commit()"
            (reverted)="box.cancel()"
          />
          <app-number-field
            fieldId="box-width"
            [label]="t.box.width"
            [value]="num(f.width)"
            [min]="0"
            [disabled]="st.locked"
            (edited)="edit('width', $event)"
            (committed)="box.commit()"
            (reverted)="box.cancel()"
          />
          <app-number-field
            fieldId="box-height"
            [label]="t.box.height"
            [value]="num(f.height)"
            [min]="0"
            [disabled]="st.locked"
            (edited)="edit('height', $event)"
            (committed)="box.commit()"
            (reverted)="box.cancel()"
          />
          @if (f.rotation !== null) {
            <app-number-field
              fieldId="box-rotation"
              unit="°"
              [label]="t.box.rotation"
              [value]="num(f.rotation)"
              [disabled]="st.locked"
              (edited)="edit('rotation', $event)"
              (committed)="box.commit()"
              (reverted)="box.cancel()"
            />
          } @else {
            <app-number-field
              fieldId="box-rotation"
              unit="°"
              placeholder="0"
              [label]="t.box.rotateBy"
              [value]="null"
              [disabled]="st.locked"
              (edited)="edit('rotateBy', $event)"
              (committed)="box.commit()"
              (reverted)="box.cancel()"
            />
          }
          <div class="tools">
            <button
              type="button"
              class="tool"
              data-testid="box-lock"
              [attr.aria-pressed]="box.lock()"
              [attr.aria-label]="t.constrain"
              [title]="t.constrain"
              (click)="box.lock.set(!box.lock())"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  [attr.d]="
                    box.lock()
                      ? 'M6 6.5a2.5 2.5 0 0 1 4 0M6 9.5a2.5 2.5 0 0 0 4 0M8 5v6'
                      : 'M6 5.5a2.5 2.5 0 0 1 4 0M6 10.5a2.5 2.5 0 0 0 4 0'
                  "
                />
              </svg>
            </button>
            <button
              type="button"
              class="tool"
              data-testid="box-flip-h"
              [disabled]="st.locked"
              [attr.aria-label]="t.box.flipH"
              [title]="t.box.flipH"
              (click)="box.apply({ flipH: true })"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2v12M6 4L2 12h4zM10 4l4 8h-4z" />
              </svg>
            </button>
            <button
              type="button"
              class="tool"
              data-testid="box-flip-v"
              [disabled]="st.locked"
              [attr.aria-label]="t.box.flipV"
              [title]="t.box.flipV"
              (click)="box.apply({ flipV: true })"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 8h12M4 6l8-4v4zM4 10l8 4v-4z" />
              </svg>
            </button>
            <div
              class="proxy"
              role="radiogroup"
              data-testid="box-pivot"
              [attr.aria-label]="t.box.pivot"
              [title]="t.box.pivot"
            >
              @for (a of anchors; track a) {
                <button
                  type="button"
                  class="dot"
                  role="radio"
                  [attr.tabindex]="a === box.pivot() ? 0 : -1"
                  [attr.aria-checked]="a === box.pivot()"
                  [attr.aria-label]="tt.anchors[a]"
                  [attr.data-anchor]="a"
                  (click)="box.pivot.set(a)"
                  (keydown)="pivotKey($event)"
                ></button>
              }
            </div>
          </div>
        </div>
        @if (st.locked) {
          <p class="note">{{ t.box.locked }}</p>
        }
      </section>
    }
  `,
  styleUrl: './box-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoxSection {
  readonly store = input<DocumentStore | null>(null);
  protected readonly box = inject(BoxService);
  protected readonly t = PROPERTIES_TEXTS;
  protected readonly tt = TRANSFORM_TEXTS;
  protected readonly anchors = ANCHORS;
  protected readonly fields = computed(() => {
    const st = this.box.state();
    return st ? frameFields(st.frame, this.box.pivot()) : null;
  });

  constructor() {
    // measure after the layers are painted (needs layout), like the canvas's selection frames
    let frame = 0;
    effect(() => {
      const s = this.store();
      s?.revision();
      s?.selection();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.box.refresh());
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));
  }

  protected num(n: number): string {
    return boxNumber(n);
  }

  protected edit(key: keyof BoxEdit, text: string | null): void {
    const n = text === null ? NaN : Number.parseFloat(text);
    if (!Number.isFinite(n)) return;
    this.box.preview({ [key]: n });
  }

  protected pivotKey(e: KeyboardEvent): void {
    const next = nextAnchor(this.box.pivot(), e.key);
    if (!next) return;
    e.preventDefault();
    this.box.pivot.set(next);
    const group = (e.currentTarget as HTMLElement).parentElement;
    group?.querySelector<HTMLElement>(`[data-anchor="${next}"]`)?.focus();
  }
}
