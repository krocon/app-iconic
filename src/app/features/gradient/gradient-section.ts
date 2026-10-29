import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ColorField } from '../../shared/controls/color-field';
import { StepperField } from '../../shared/controls/stepper-field';
import { FilesService } from '../files/files.service';
import { parseValue } from '../sketch/sketch-overlay';
import { cssStops, Paint } from './gradient-model';
import { GradientService } from './gradient.service';
import { GRADIENT_TEXTS as T } from './gradient-texts';

/**
 * The "Gradient" section of the properties panel (prompt 032): for one element painting with a
 * gradient (or the gradient itself) kind, units, spread, transform and the stop bar – drag a stop,
 * click the bar for a new one, colour / opacity / position of the chosen one; a shared gradient can
 * be made unique. Without a gradient: create a linear or radial one for fill or stroke.
 */
@Component({
  selector: 'app-gradient-section',
  imports: [ColorField, StepperField],
  template: `
    @if (visible()) {
      <section class="section" data-section="gradient" data-testid="gradient-section">
        <h3 class="section-title">{{ t.section }}</h3>
        <div class="rows">
          <label class="label" for="gradient-paint">{{ t.paint }}</label>
          <select id="gradient-paint" class="input" (change)="paint.set($any($event.target).value)">
            @for (p of paints; track p) {
              <option [value]="p" [selected]="p === paint()">{{ t.paints[p] }}</option>
            }
          </select>
        </div>
        @if (target(); as g) {
          @if (g.users > 1 && g.owner) {
            <p class="info hint" data-testid="gradient-shared">{{ t.shared(g.users) }}</p>
            <button
              type="button"
              class="btn"
              data-testid="gradient-unique"
              (click)="run('gradient.makeUnique')"
            >
              {{ t.makeUnique }}
            </button>
          }
          <button
            type="button"
            class="btn"
            data-testid="gradient-on-canvas"
            [attr.aria-pressed]="service.onCanvas()"
            (click)="run('gradient.editOnCanvas')"
          >
            {{ t.onCanvas }}
          </button>
          <div class="rows">
            <label class="label" for="gradient-kind">{{ t.kind }}</label>
            <select
              id="gradient-kind"
              class="input"
              data-testid="gradient-kind"
              (change)="set('kind', $event)"
            >
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="k === g.info.kind">{{ t.kinds[k] }}</option>
              }
            </select>
            <label class="label" for="gradient-units">{{ t.units }}</label>
            <select id="gradient-units" class="input" (change)="set('gradientUnits', $event)">
              @for (u of unitList; track u) {
                <option [value]="u" [selected]="u === g.info.units">{{ t.unitLabels[u] }}</option>
              }
            </select>
            <label class="label" for="gradient-spread">{{ t.spread }}</label>
            <select id="gradient-spread" class="input" (change)="set('spreadMethod', $event)">
              @for (s of spreads; track s) {
                <option [value]="s" [selected]="s === g.info.spread">{{ t.spreads[s] }}</option>
              }
            </select>
            <label class="label" for="gradient-transform">{{ t.transform }}</label>
            <input
              id="gradient-transform"
              class="input"
              type="text"
              spellcheck="false"
              [value]="g.info.transform"
              (change)="set('gradientTransform', $event)"
            />
          </div>
          <h4 class="sub">{{ t.stops }}</h4>
          @if (g.info.inherited) {
            <p class="info">{{ t.inherited }}</p>
          }
          <div
            class="bar"
            data-testid="gradient-bar"
            [title]="t.stopBar"
            [style.background]="css()"
            (pointerdown)="onBar($event)"
          >
            @for (s of g.info.stops; track $index; let i = $index) {
              <button
                type="button"
                class="stop"
                role="slider"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-valuenow]="pct(s.offset)"
                [attr.aria-label]="t.stop(i + 1, pct(s.offset) + ' %')"
                [attr.data-stop]="i"
                [class.active]="i === stopIndex()"
                [style.left.%]="s.offset * 100"
                [style.background]="s.color"
                (pointerdown)="onStop($event, i)"
                (keydown)="onStopKey($event, i)"
              ></button>
            }
          </div>
          @if (stop(); as s) {
            <div class="stop-editor">
              <app-color-field
                fieldId="gradient-stop-color"
                [label]="t.color"
                [value]="s.color"
                (edited)="liveStop({ color: $event ?? '#000000' })"
                (committed)="service.end()"
                (reverted)="service.end(false)"
              />
              <div class="rows">
                <span class="label">{{ t.opacity }}</span>
                <app-stepper-field
                  field="stop-opacity"
                  [label]="t.opacity"
                  [step]="0.1"
                  [min]="0"
                  [max]="1"
                  [value]="'' + s.opacity"
                  (valueChange)="numberStop('opacity', $event)"
                />
                <span class="label">{{ t.offset }}</span>
                <app-stepper-field
                  field="stop-offset"
                  [label]="t.offset"
                  [step]="1"
                  [min]="0"
                  [max]="100"
                  [value]="'' + pct(s.offset)"
                  (valueChange)="numberStop('offset', $event)"
                />
              </div>
              <button
                type="button"
                class="btn"
                data-testid="gradient-remove-stop"
                [disabled]="g.info.stops.length <= 2"
                (click)="removeStop()"
              >
                {{ t.removeStop }}
              </button>
            </div>
          }
        } @else {
          <div class="buttons">
            <button
              type="button"
              class="btn"
              data-testid="gradient-create-linear"
              (click)="create('linear')"
            >
              {{ t.createLinear }}
            </button>
            <button
              type="button"
              class="btn"
              data-testid="gradient-create-radial"
              (click)="create('radial')"
            >
              {{ t.createRadial }}
            </button>
          </div>
        }
      </section>
    }
  `,
  styleUrl: './gradient-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradientSection {
  protected readonly service = inject(GradientService);
  private readonly actions = inject(ActionService);
  private readonly files = inject(FilesService);
  protected readonly t = T;
  protected readonly paints: readonly Paint[] = ['fill', 'stroke'];
  protected readonly kinds = ['linear', 'radial'] as const;
  protected readonly unitList = ['objectBoundingBox', 'userSpaceOnUse'] as const;
  protected readonly spreads = ['pad', 'reflect', 'repeat'] as const;
  protected readonly paint = this.service.paint;
  protected readonly stopIndex = signal(0);

  protected readonly target = computed(() => {
    const s = this.files.store();
    s?.revision();
    s?.selection();
    return this.service.target(this.paint());
  });
  protected readonly visible = computed(() => (this.files.store()?.selection().length ?? 0) === 1);
  protected readonly css = computed(() => cssStops(this.target()?.info.stops ?? []));
  protected readonly stop = computed(() => {
    const st = this.target()?.info.stops ?? [];
    return st[Math.min(this.stopIndex(), st.length - 1)] ?? null;
  });

  protected pct(v: number): number {
    return Math.round(v * 1000) / 10;
  }

  protected run(id: string, args?: Record<string, unknown>): void {
    this.actions.run(id, args);
  }

  protected create(kind: 'linear' | 'radial'): void {
    this.run('gradient.create', { kind, paint: this.paint() });
  }

  protected set(name: string, e: Event): void {
    const v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    if (name === 'kind') this.run('gradient.set', { kind: v, paint: this.paint() });
    else
      this.run('gradient.set', { attributes: { [name]: v.trim() || null }, paint: this.paint() });
  }

  protected liveStop(c: { color?: string; offset?: number; opacity?: number }): void {
    const g = this.target();
    if (!g) return;
    this.service.begin();
    this.service.setStop(g, Math.min(this.stopIndex(), g.info.stops.length - 1), c);
  }

  protected numberStop(k: 'opacity' | 'offset', text: string): void {
    const v = parseValue(text);
    if (v === null) return;
    this.run('gradient.setStop', {
      index: this.stopIndex(),
      [k]: k === 'offset' ? v / 100 : v,
      paint: this.paint(),
    });
  }

  protected removeStop(): void {
    this.run('gradient.removeStop', { index: this.stopIndex(), paint: this.paint() });
    this.stopIndex.update((i) => Math.max(0, i - 1));
  }

  private offsetAt(e: PointerEvent, bar: HTMLElement): number {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(r.width, 1)));
  }

  protected onBar(e: PointerEvent): void {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const off = this.offsetAt(e, e.currentTarget as HTMLElement);
    this.run('gradient.addStop', { offset: Math.round(off * 1000) / 1000, paint: this.paint() });
    const g = this.target();
    this.stopIndex.set(g ? g.info.stops.filter((s) => s.offset < off).length : 0);
  }

  protected onStop(e: PointerEvent, i: number): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.stopIndex.set(i);
    const bar = (e.currentTarget as HTMLElement).parentElement!;
    const btn = e.currentTarget as HTMLElement;
    btn.focus();
    const doc = btn.ownerDocument;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const g = this.target();
      if (!g) return;
      moved = true;
      this.service.begin();
      this.service.setStop(g, i, { offset: Math.round(this.offsetAt(ev, bar) * 1000) / 1000 });
    };
    const up = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      if (moved) this.service.end();
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  protected onStopKey(e: KeyboardEvent, i: number): void {
    const g = this.target();
    if (!g) return;
    const s = g.info.stops[i];
    const step = e.shiftKey ? 0.1 : 0.01;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      this.run('gradient.setStop', {
        index: i,
        offset: s.offset + (e.key === 'ArrowRight' ? step : -step),
        paint: this.paint(),
      });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      this.stopIndex.set(i);
      this.removeStop();
    }
  }
}
