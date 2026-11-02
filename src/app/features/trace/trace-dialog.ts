import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { TRACE_LIMITS, TraceCurveMode, TraceResult } from '../../core/trace/trace.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { TraceSource } from './trace-plan';
import { TRACE_PRESET_IDS, TRACE_SOURCES, TraceOverrides, TraceSourceKind } from './trace-presets';
import { TRACE_TEXTS } from './trace-texts';
import { TraceService } from './trace.service';

/** Wait this long after a change before tracing again. */
export const TRACE_DELAY = 250;

type Toggle = 'shapes' | 'gradients' | 'harmonize' | 'dropBackground';
type Range = 'colorPrecision' | 'layerDifference' | 'speckle' | 'threshold';

/**
 * "Trace Image…" (prompt 087 E16): the image (layer, template, clipboard, file), a style, details,
 * the original beside the REAL result (Rust, debounced, stale answers dropped) and its summary;
 * "Insert as Layer" adds it in one undo step.
 */
@Component({
  selector: 'app-trace-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="52rem" (closed)="dialogs.close()">
      <div class="row" role="group" [attr.aria-label]="t.source">
        @for (k of sources; track k) {
          <button
            type="button"
            class="btn"
            [class.on]="source()?.kind === k"
            [attr.aria-pressed]="source()?.kind === k"
            [attr.data-testid]="'trace-source-' + k"
            [disabled]="!service.available(k)"
            (click)="useSource(k)"
          >
            {{ t.sources[k] }}
          </button>
        }
        @if (source(); as s) {
          <span class="note" data-testid="trace-source-name"
            >{{ s.image.name }} · {{ t.size(s.image.width, s.image.height) }}</span
          >
        }
      </div>
      <div class="row presets" role="radiogroup" [attr.aria-label]="t.preset">
        @for (p of presets; track p) {
          <label class="preset" [class.on]="service.preset() === p">
            <input
              type="radio"
              name="trace-preset"
              [value]="p"
              [checked]="service.preset() === p"
              [attr.data-testid]="'trace-preset-' + p"
              (change)="service.choosePreset(p)"
            />
            {{ t.presets[p] }}
          </label>
        }
      </div>
      <p class="note">{{ t.presetHints[service.preset()] }}</p>
      <div class="previews">
        <figure>
          @if (source(); as s) {
            <img [src]="s.image.dataUrl" alt="" />
          }
          <figcaption>{{ t.original }}</figcaption>
        </figure>
        <figure data-testid="trace-preview">
          @if (resultUrl(); as url) {
            <img [src]="url" [attr.alt]="t.result" />
          }
          <figcaption>{{ t.result }}</figcaption>
        </figure>
      </div>
      <p class="note stats" aria-live="polite" data-testid="trace-stats">
        @if (pending()) {
          {{ t.tracing }}
        } @else if (result(); as r) {
          {{ t.stats(r.stats) }}
        }
      </p>
      <details class="details">
        <summary>{{ t.details }}</summary>
        <div class="grid">
          @for (k of toggles; track k) {
            <label class="check">
              <input
                type="checkbox"
                [checked]="flag(k)"
                [attr.data-testid]="'trace-' + k"
                (change)="onToggle(k, $event)"
              />
              {{ t[k] }}
            </label>
          }
          <label class="field">
            <span>{{ t.curves }}</span>
            <select class="input" data-testid="trace-curves" (change)="onCurves($event)">
              @for (c of curveModes; track c) {
                <option [value]="c" [selected]="opt()?.curves === c">{{ t.curveModes[c] }}</option>
              }
            </select>
          </label>
          @for (r of ranges(); track r.key) {
            <label class="field">
              <span
                >{{ t[r.key] }} <output>{{ amount(r.key) }}</output></span
              >
              <input
                type="range"
                [min]="r.min"
                [max]="r.max"
                [value]="amount(r.key)"
                [attr.data-testid]="'trace-' + r.key"
                (change)="onRange(r.key, $event)"
              />
            </label>
          }
        </div>
      </details>
      <p class="error" role="alert" data-testid="trace-error">{{ error() }}</p>
      <div class="actions">
        <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
        <button
          type="button"
          class="btn primary"
          data-testid="trace-insert"
          [disabled]="!canInsert()"
          (click)="insert()"
        >
          {{ t.insert }}
        </button>
      </div>
    </app-modal>
  `,
  styleUrl: './trace-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TraceDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly service = inject(TraceService);
  protected readonly t = TRACE_TEXTS;
  protected readonly sources = TRACE_SOURCES;
  protected readonly presets = TRACE_PRESET_IDS;
  protected readonly curveModes: readonly TraceCurveMode[] = ['spline', 'polygon', 'pixel'];
  protected readonly toggles: readonly Toggle[] = [
    'shapes',
    'gradients',
    'harmonize',
    'dropBackground',
  ];
  protected readonly source = this.service.source;
  protected readonly opt = this.service.options;
  protected readonly result = signal<TraceResult | null>(null);
  /** The source the result belongs to (insert only what was shown). */
  private resultSource: TraceSource | null = null;
  protected readonly error = signal('');
  protected readonly pending = signal(false);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly ranges = computed(() => {
    const L = TRACE_LIMITS;
    const all: { key: Range; min: number; max: number }[] = [
      { key: 'colorPrecision', min: L.colorPrecision.min, max: L.colorPrecision.max },
      { key: 'layerDifference', min: 0, max: 128 },
      { key: 'speckle', min: 0, max: 64 },
    ];
    return this.opt()?.mode === 'mono'
      ? [{ key: 'threshold' as Range, min: L.threshold.min, max: L.threshold.max }, all[2]]
      : all;
  });
  protected readonly resultUrl = computed(() => {
    const r = this.result();
    return r ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}` : null;
  });
  protected readonly canInsert = computed(
    () => !!this.result() && !this.pending() && !this.error(),
  );

  constructor() {
    effect(() => {
      const src = this.source();
      const opt = this.opt();
      untracked(() => this.schedule(src, opt));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private schedule(src: TraceSource | null, opt: ReturnType<typeof this.opt>): void {
    clearTimeout(this.timer);
    const seq = ++this.seq;
    if (!src || !opt) {
      this.pending.set(false);
      return;
    }
    this.pending.set(true);
    this.timer = setTimeout(async () => {
      try {
        const r = await this.service.trace(src, opt);
        if (seq !== this.seq) return;
        this.result.set(r);
        this.resultSource = src;
        this.error.set('');
      } catch (e) {
        if (seq !== this.seq) return;
        this.result.set(null);
        this.error.set(describeFsError(toFsError(e)));
      }
      this.pending.set(false);
    }, TRACE_DELAY);
  }

  protected useSource(k: TraceSourceKind): void {
    void this.service.useSource(k);
  }

  protected flag(k: Toggle): boolean {
    return this.opt()?.[k] ?? false;
  }

  protected amount(k: Range): number {
    return this.opt()?.[k] ?? 0;
  }

  protected onToggle(k: Toggle, e: Event): void {
    const o: TraceOverrides = {};
    o[k] = (e.target as HTMLInputElement).checked;
    this.service.change(o);
  }

  protected onRange(k: Range, e: Event): void {
    const o: TraceOverrides = {};
    o[k] = Number((e.target as HTMLInputElement).value);
    this.service.change(o);
  }

  protected onCurves(e: Event): void {
    this.service.change({ curves: (e.target as HTMLSelectElement).value as TraceCurveMode });
  }

  protected insert(): void {
    const r = this.result();
    const src = this.resultSource;
    if (!r || !src || !this.canInsert()) return;
    this.dialogs.close();
    this.service.insert(src, r);
  }
}
