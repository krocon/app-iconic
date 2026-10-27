import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CLIP_UNITS } from '../document/model/clip-units';
import { ClipService } from './clip.service';
import { CLIP_TEXTS } from './clip-texts';

/**
 * The "Clip Path" section of the properties panel (design 014 E13): for one node the picker
 * None / Inherit from Layer / the clips of its asset, for one layer its layer clip, for a clip (or
 * one of its shapes) the units; Create, Edit, Remove. Everything runs as `clip.*` actions – the
 * same way as the menu and the AI.
 */
@Component({
  selector: 'app-clip-path-section',
  template: `
    @if (panel(); as p) {
      <section class="section" data-section="clip" data-testid="clip-section">
        <h3 class="section-title">{{ t.section }}</h3>
        <div class="rows">
          @if (p.target.kind !== 'clip') {
            <label class="label" for="clip-picker">
              {{ p.target.kind === 'layer' ? t.layerClip : t.clip }}
            </label>
            <select
              id="clip-picker"
              class="input"
              data-testid="clip-picker"
              (change)="choose($event)"
            >
              @for (o of p.options; track o.value) {
                <option [value]="o.value" [disabled]="o.disabled" [selected]="o.value === p.value">
                  {{ o.label }}
                </option>
              }
            </select>
          }
          @if (p.clip; as c) {
            <label class="label" for="clip-units">{{ t.units }}</label>
            <select id="clip-units" class="input" data-testid="clip-units" (change)="units($event)">
              @for (u of unitList; track u) {
                <option [value]="u" [selected]="u === c.units">{{ t.unitLabels[u] }}</option>
              }
            </select>
            <p class="info" data-testid="clip-users">
              #{{ c.id }} · {{ c.users ? t.users(c.users) : t.unused }}
            </p>
          }
          @if (p.hint) {
            <p class="info hint" data-testid="clip-hint">{{ p.hint }}</p>
          }
          <div class="buttons">
            @if (p.target.kind !== 'clip') {
              <button
                type="button"
                class="btn"
                data-testid="clip-create"
                (click)="run('clip.create')"
              >
                {{ t.create }}
              </button>
            }
            @if (p.clip) {
              <button
                type="button"
                class="btn"
                data-testid="clip-edit"
                [disabled]="!actions.enabled('clip.edit')"
                (click)="run('clip.edit')"
              >
                {{ t.edit }}
              </button>
              <button
                type="button"
                class="btn"
                data-testid="clip-remove"
                (click)="run('clip.remove')"
              >
                {{ t.remove }}
              </button>
            }
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .section {
      border-bottom: 1px solid var(--color-border);
    }
    .section-title {
      margin: 0;
      padding: var(--space-2) 0;
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .rows {
      display: grid;
      grid-template-columns: 6.5rem minmax(0, 1fr);
      gap: var(--space-1) var(--space-2);
      align-items: center;
      padding-bottom: var(--space-2);
      font-size: var(--font-size-small);
    }
    .input {
      min-width: 0;
    }
    .info,
    .buttons {
      grid-column: 1 / -1;
      margin: 0;
    }
    .info {
      color: var(--color-text-muted);
    }
    .hint {
      color: var(--color-warning);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClipPathSection {
  protected readonly clip = inject(ClipService);
  protected readonly actions = inject(ActionService);
  protected readonly t = CLIP_TEXTS;
  protected readonly unitList = CLIP_UNITS;

  protected readonly panel = computed(() => {
    const s = this.clip.store();
    if (!s) return null;
    s.revision();
    s.selection();
    s.items();
    return this.clip.panel();
  });

  protected choose(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    if (!this.clip.choose(v)) (e.target as HTMLSelectElement).value = this.panel()?.value ?? '';
  }

  protected units(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.actions.run('clip.setUnits', { units: v });
  }

  protected run(id: string): void {
    this.actions.run(id);
  }
}
