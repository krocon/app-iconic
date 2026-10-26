import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rulerTicks } from '../../shared/geometry/ruler-ticks';
import { ViewTransform } from '../../shared/geometry/view-transform';

/** Length of major / minor ticks relative to the ruler's thickness. */
const MAJOR = 0.75;
const MINOR = 0.3;

/**
 * A ruler along the top or left edge of the canvas (design 004 E12): drawn into a `<canvas>`
 * (device-pixel sharp), ticks from `rulerTicks`, labels in document units, a marker at the
 * pointer. Colours from the tokens `--ai-ruler-*`; redrawn when the colour scheme changes.
 */
@Component({
  selector: 'app-canvas-ruler',
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      background: var(--ai-ruler-bg);
      color: var(--ai-ruler-text);
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasRuler {
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly view = input.required<ViewTransform>();
  /** Length in CSS pixels (the viewport's width or height). */
  readonly length = input.required<number>();
  /** Pointer position along this ruler in viewport pixels, `null` outside. */
  readonly marker = input<number | null>(null);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly scheme = signal(0);

  constructor() {
    const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const bump = () => this.scheme.update((n) => n + 1);
    mq?.addEventListener?.('change', bump);
    inject(DestroyRef).onDestroy(() => mq?.removeEventListener?.('change', bump));
    effect(() => {
      this.scheme();
      this.draw(this.canvas().nativeElement, this.view(), this.length(), this.marker());
    });
  }

  private draw(canvas: HTMLCanvasElement, v: ViewTransform, length: number, marker: number | null) {
    const horizontal = this.orientation() === 'horizontal';
    const thick = horizontal ? canvas.clientHeight : canvas.clientWidth;
    const ctx = canvas.getContext?.('2d');
    if (!ctx || length <= 0 || thick <= 0) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const [w, h] = horizontal ? [length, thick] : [thick, length];
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(canvas);
    const token = (name: string) => css.getPropertyValue(name).trim();
    ctx.strokeStyle = token('--ai-ruler-tick');
    ctx.fillStyle = token('--ai-ruler-text');
    ctx.font = `10px ${token('--font-mono') || 'monospace'}`;
    ctx.lineWidth = 1;
    const offset = horizontal ? v.panX : v.panY;
    const ticks = rulerTicks(v.zoom, offset, length);
    ctx.beginPath();
    for (const t of ticks) {
      const p = Math.round(t.pos) + 0.5;
      const len = thick * (t.major ? MAJOR : MINOR);
      if (horizontal) {
        ctx.moveTo(p, thick);
        ctx.lineTo(p, thick - len);
      } else {
        ctx.moveTo(thick, p);
        ctx.lineTo(thick - len, p);
      }
    }
    // edge towards the canvas
    if (horizontal) {
      ctx.moveTo(0, thick - 0.5);
      ctx.lineTo(w, thick - 0.5);
    } else {
      ctx.moveTo(thick - 0.5, 0);
      ctx.lineTo(thick - 0.5, h);
    }
    ctx.stroke();
    ctx.textBaseline = 'top';
    for (const t of ticks) {
      if (!t.major) continue;
      const label = String(t.value);
      if (horizontal) {
        ctx.fillText(label, Math.round(t.pos) + 3, 2);
      } else {
        ctx.save();
        ctx.translate(2, Math.round(t.pos) - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
    if (marker !== null) {
      ctx.strokeStyle = token('--color-accent');
      ctx.beginPath();
      const p = Math.round(marker) + 0.5;
      if (horizontal) {
        ctx.moveTo(p, 0);
        ctx.lineTo(p, thick);
      } else {
        ctx.moveTo(0, p);
        ctx.lineTo(thick, p);
      }
      ctx.stroke();
    }
  }
}
