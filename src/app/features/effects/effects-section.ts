import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ColorButton } from '../../shared/controls/color-button';
import { NumberField } from '../../shared/controls/number-field';
import { SegmentedField } from '../../shared/controls/segmented-field';
import { Effect, EFFECT_KINDS, EffectKind } from './effect-model';
import { EffectsService } from './effects.service';
import { EFFECTS_TEXTS as T } from './effects-texts';

type NumKey = 'opacity' | 'dx' | 'dy' | 'radius';

/**
 * "Effects" of the properties panel (prompt 076 E1): outer shadow, inner shadow, blur of the one
 * selected element – a checkbox adds / removes each, its fields edit live (typing, dragging the
 * label: one undo step per gesture). A foreign filter only says so. With a mask: its type and
 * "Release Mask".
 */
@Component({
  selector: 'app-effects-section',
  imports: [ColorButton, NumberField, SegmentedField],
  template: `
    @if (fx.target(); as ref) {
      <section class="section" data-section="effects" data-testid="effects-section">
        <h3 class="title">{{ t.section }}</h3>
        @if (fx.state()?.kind === 'foreign') {
          <p class="note" data-testid="effects-foreign">{{ t.foreign }}</p>
        } @else {
          @if (shared()) {
            <p class="note">{{ t.shared }}</p>
          }
          @for (k of kinds; track k) {
            @let e = effect(k);
            <div class="effect" [attr.data-effect]="k">
              <label class="head">
                <input
                  type="checkbox"
                  [attr.data-testid]="'effect-' + k"
                  [checked]="!!e"
                  (change)="toggle(k, $any($event.target).checked)"
                />
                {{ t.kinds[k] }}
              </label>
              @if (e) {
                <div class="rows">
                  @if (k !== 'blur') {
                    <span class="label">{{ t.color }}</span>
                    <app-color-button
                      [value]="e.color"
                      [label]="t.kinds[k] + ' ' + t.color"
                      (edited)="fx.preview(k, { color: hex($event) })"
                      (committed)="fx.commit()"
                      (reverted)="fx.cancel()"
                    />
                    <span></span>
                    @for (n of shadowFields; track n) {
                      <app-number-field
                        [fieldId]="'fx-' + k + '-' + n"
                        [label]="t[n]"
                        [value]="num(e, n)"
                        [step]="n === 'opacity' ? 0.05 : 1"
                        [min]="n === 'opacity' || n === 'radius' ? 0 : undefined"
                        [max]="n === 'opacity' ? 1 : undefined"
                        [compact]="true"
                        (edited)="edit(k, n, $event)"
                        (committed)="fx.commit()"
                        (reverted)="fx.cancel()"
                      />
                      <span></span>
                    }
                  } @else {
                    <app-number-field
                      [fieldId]="'fx-blur-radius'"
                      [label]="t.radius"
                      [value]="num(e, 'radius')"
                      [min]="0"
                      [step]="0.5"
                      [compact]="true"
                      (edited)="edit(k, 'radius', $event)"
                      (committed)="fx.commit()"
                      (reverted)="fx.cancel()"
                    />
                    <span></span>
                  }
                </div>
              }
            </div>
          }
        }
        @if (fx.maskType(); as mt) {
          <div class="rows mask">
            <app-segmented-field
              fieldId="fx-mask-type"
              [label]="t.mask"
              [value]="mt"
              [options]="['luminance', 'alpha']"
              [optionLabels]="t.maskTypes"
              (edited)="actions.run('mask.type', { type: $event })"
            />
            <button type="button" class="btn" (click)="actions.run('mask.release')">
              {{ t.release }}
            </button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .section {
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--color-border);
    }
    .title {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .note {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .head {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      font-size: var(--font-size-small);
    }
    .rows {
      display: grid;
      grid-template-columns: 5rem minmax(0, 1fr) 0;
      gap: var(--space-1) var(--space-2);
      align-items: center;
      padding: var(--space-1) 0 var(--space-2) var(--space-4);
    }
    .label {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .mask {
      padding-left: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EffectsSection {
  protected readonly t = T;
  protected readonly fx = inject(EffectsService);
  protected readonly actions = inject(ActionService);
  protected readonly kinds = EFFECT_KINDS;
  protected readonly shadowFields: readonly NumKey[] = ['opacity', 'dx', 'dy', 'radius'];
  protected readonly shared = computed(() => {
    const s = this.fx.state();
    return s?.kind === 'managed' && s.shared;
  });

  protected effect(k: EffectKind): Effect | null {
    return this.fx.effects().find((e) => e.kind === k) ?? null;
  }

  protected num(e: Effect, n: NumKey): string {
    return String(e[n]);
  }

  protected hex(v: string): string {
    return v.slice(0, 7);
  }

  protected toggle(k: EffectKind, on: boolean): void {
    void this.actions.run(on ? 'effect.add' : 'effect.remove', { kind: k });
  }

  protected edit(k: EffectKind, n: NumKey, v: string | null): void {
    const x = Number(v);
    if (v === null || !Number.isFinite(x)) return;
    this.fx.preview(k, { [n]: x });
  }
}
