import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  COLOR_FORMATS,
  ColorFormat,
  formatColor,
  formatOf,
  hsbToRgb,
  parseColorFunction,
  rgbToHsb,
  writeLike,
} from '../color/color-spaces';
import { browserColor, nativeValue, parseHex, parseRgbFunction, Rgba, toRgba } from './color-value';
import { ColorSwatches } from './color-swatches';
import { CONTROLS_TEXTS } from './controls-texts';

const WIDTH = 248;

/** What the value field accepts: hex, `rgb()`, `hsl()`, `hsb()`, `oklch()`, any CSS colour. */
export function parseAny(text: string): Rgba | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('#')) return parseHex(t);
  return parseRgbFunction(t) ?? parseColorFunction(t) ?? toRgba(t, browserColor);
}

/**
 * The colour popover (prompt 074 E1): saturation/brightness area, hue, alpha, the value in a
 * chosen format (Hex, RGB, HSL, HSB, OKLCH), the swatches of the app (document, recent, palette)
 * and the system picker. Every change is emitted live (`changed`, written like the old value –
 * `writeLike`); Enter, "Done" or a click outside end it (`done`), Esc takes it back (`cancelled`).
 * Non-modal `role="dialog"` beside its opener, focus inside on open.
 */
@Component({
  selector: 'app-color-picker',
  template: `
    <div
      class="picker"
      role="dialog"
      [attr.aria-label]="t.colorDialog(label())"
      data-testid="color-picker"
      [style.left.px]="pos().left"
      [style.top.px]="pos().top"
      (keydown)="onKey($event)"
    >
      <div
        class="sv"
        tabindex="0"
        role="slider"
        [attr.aria-label]="t.saturation"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="svNow()"
        [attr.aria-valuetext]="svText()"
        [style.background-color]="'hsl(' + hsb().h + ' 100% 50%)'"
        (pointerdown)="svDown($event)"
        (pointermove)="svMove($event)"
        (pointerup)="svUp($event)"
        (keydown)="svKey($event)"
      >
        <span class="knob" [style.left.%]="hsb().s" [style.top.%]="100 - hsb().b"></span>
      </div>
      <input
        class="range hue"
        type="range"
        min="0"
        max="360"
        step="1"
        data-testid="color-hue"
        [attr.aria-label]="t.hue"
        [value]="hsb().h"
        (input)="setHsb({ h: +$any($event.target).value })"
      />
      <input
        class="range alpha"
        type="range"
        min="0"
        max="100"
        step="1"
        data-testid="color-alpha"
        [attr.aria-label]="t.alpha"
        [style.--c]="opaque()"
        [value]="alphaPct()"
        (input)="setAlpha(+$any($event.target).value / 100)"
      />
      <div class="row">
        <select
          class="input fmt"
          data-testid="color-format"
          [attr.aria-label]="t.format"
          (change)="format.set($any($event.target).value)"
        >
          @for (f of formats; track f) {
            <option [value]="f" [selected]="f === format()">{{ f.toUpperCase() }}</option>
          }
        </select>
        <input
          class="input text"
          type="text"
          spellcheck="false"
          data-testid="color-text"
          [attr.aria-label]="t.value"
          [value]="text()"
          (change)="typed($any($event.target).value)"
        />
      </div>
      @for (g of groups(); track g.id) {
        @if (g.colors.length) {
          <div class="group" [attr.data-group]="g.id">
            <span class="glabel">{{ g.label }}</span>
            <span class="swatches">
              @for (c of g.colors; track c) {
                <button
                  type="button"
                  class="sw"
                  [style.background]="c"
                  [attr.data-color]="c"
                  [attr.aria-label]="t.swatch(c)"
                  [title]="c"
                  (click)="useSwatch(c)"
                ></button>
              }
            </span>
          </div>
        }
      }
      <div class="row actions">
        <label class="btn system" [title]="t.systemHint">
          {{ t.system }}
          <input type="color" class="native" [value]="native()" (input)="fromNative($event)" />
        </label>
        <button type="button" class="btn" data-testid="color-add" (click)="addToPalette()">
          +
          <span class="sr">{{ t.addToPalette }}</span>
        </button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-testid="color-done" (click)="finish()">
          {{ t.done }}
        </button>
      </div>
    </div>
  `,
  styleUrl: './color-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onOutside($event)' },
})
export class ColorPicker implements OnInit {
  readonly value = input<string | null>(null);
  /** Shown when there is no value (inherited / default). */
  readonly fallback = input('');
  readonly label = input('');
  /** The opener's box (client pixels). */
  readonly anchor = input<{ left: number; top: number; right: number; bottom: number } | null>(
    null,
  );
  readonly changed = output<string>();
  readonly done = output<void>();
  readonly cancelled = output<void>();
  protected readonly t = CONTROLS_TEXTS;
  protected readonly formats = COLOR_FORMATS;
  private readonly swatches = inject(ColorSwatches);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly rgba = signal<Rgba>({ r: 0, g: 0, b: 0, a: 1 });
  /** Hue and saturation stay when the colour gets grey / black. */
  protected readonly hsb = signal(rgbToHsb(this.rgba()));
  protected readonly format = signal<ColorFormat>('hex');
  protected readonly text = computed(() => formatColor(this.rgba(), this.format()));
  protected readonly alphaPct = computed(() => Math.round(this.rgba().a * 100));
  protected readonly opaque = computed(() => formatColor({ ...this.rgba(), a: 1 }, 'hex'));
  protected readonly native = computed(() => nativeValue(this.opaque()));
  protected readonly groups = computed(() => this.swatches.groups());
  protected readonly svNow = computed(() => Math.round(this.hsb().s));
  protected readonly svText = computed(
    () => `${Math.round(this.hsb().s)}% / ${Math.round(this.hsb().b)}%`,
  );
  protected readonly pos = computed(() => {
    const a = this.anchor();
    const vw = typeof innerWidth === 'number' ? innerWidth : 1024;
    const vh = typeof innerHeight === 'number' ? innerHeight : 768;
    const h = 380;
    let left = a ? a.left : 16;
    let top = a ? a.bottom + 4 : 16;
    if (top + h > vh - 8 && a) top = Math.max(8, a.top - 4 - h);
    left = Math.max(8, Math.min(left, vw - WIDTH - 8));
    return { left, top: Math.max(8, Math.min(top, vh - h - 8)) };
  });
  private dragging: number | null = null;
  private written: string | null = null;

  ngOnInit(): void {
    const start = toRgba(this.value() || this.fallback(), browserColor);
    if (start) {
      this.rgba.set(start);
      this.hsb.set(rgbToHsb(start));
    }
    this.format.set(formatOf(this.value()));
  }

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.sv')?.focus());
  }

  private emit(c: Rgba): void {
    this.rgba.set(c);
    this.written = writeLike(this.value() || this.fallback(), c);
    this.changed.emit(this.written);
  }

  setHsb(part: Partial<{ h: number; s: number; b: number }>): void {
    const next = { ...this.hsb(), ...part };
    this.hsb.set(next);
    this.emit(hsbToRgb(next, this.rgba().a));
  }

  setAlpha(a: number): void {
    this.emit({ ...this.rgba(), a: Math.max(0, Math.min(1, a)) });
  }

  private setRgba(c: Rgba): void {
    const hsb = rgbToHsb(c);
    // grey keeps the hue it had, black the saturation too
    this.hsb.set({
      h: hsb.s > 0 ? hsb.h : this.hsb().h,
      s: hsb.b > 0 ? hsb.s : this.hsb().s,
      b: hsb.b,
    });
    this.emit(c);
  }

  protected typed(text: string): void {
    const c = parseAny(text);
    if (c) this.setRgba(c);
  }

  protected useSwatch(c: string): void {
    const v = parseAny(c);
    if (v) this.setRgba(v);
  }

  protected fromNative(e: Event): void {
    const c = parseHex((e.target as HTMLInputElement).value);
    if (c) this.setRgba({ ...c, a: this.rgba().a });
  }

  protected addToPalette(): void {
    this.swatches.addToPalette(formatColor(this.rgba(), 'hex'));
  }

  private svAt(e: PointerEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100;
    const b = (1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))) * 100;
    this.setHsb({ s, b });
  }

  protected svDown(e: PointerEvent): void {
    this.dragging = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.svAt(e);
  }

  protected svMove(e: PointerEvent): void {
    if (this.dragging === e.pointerId) this.svAt(e);
  }

  protected svUp(e: PointerEvent): void {
    if (this.dragging === e.pointerId) this.dragging = null;
  }

  protected svKey(e: KeyboardEvent): void {
    const step = e.shiftKey ? 10 : 1;
    const { s, b } = this.hsb();
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    this.setHsb({
      s: Math.max(0, Math.min(100, s + d[0])),
      b: Math.max(0, Math.min(100, b + d[1])),
    });
  }

  finish(): void {
    if (this.written) this.swatches.used(writeLike(null, this.rgba()));
    this.done.emit();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancelled.emit();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      // the value field takes its text first (change), then the popover ends
      if (e.target instanceof HTMLInputElement && e.target.type === 'text')
        this.typed(e.target.value);
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    }
  }

  protected onOutside(e: PointerEvent): void {
    const inside = this.host.nativeElement.contains(e.target as Node);
    // the opener toggles itself
    if (!inside && !(e.target as Element | null)?.closest?.('[data-color-opener]')) this.finish();
  }
}
