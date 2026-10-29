import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { formatValue, measure } from '../../shared/geometry/dimension';
import { dimensionPath, dimensionShape } from './dimension-markup';
import { DimensionTool } from './dimension-tool';
import { MeasureTool } from './measure-tool';

/**
 * The overlay of Measure and Dimension (prompt 048), in viewport pixels: the hovered edge or
 * circle, the picked points, the dimension being placed with its value, the measuring line.
 */
@Component({
  selector: 'app-dimension-overlay',
  template: `
    @if (dimension.on() || measuring.on()) {
      <svg class="overlay" aria-hidden="true" data-testid="dimension-overlay">
        @if (hover(); as h) {
          @if (h.kind === 'circle') {
            <circle class="hover" [attr.cx]="h.c.x" [attr.cy]="h.c.y" [attr.r]="h.r" />
          } @else {
            <line
              class="hover"
              [attr.x1]="h.a.x"
              [attr.y1]="h.a.y"
              [attr.x2]="h.b.x"
              [attr.y2]="h.b.y"
            />
          }
        }
        @for (p of picks(); track $index) {
          <circle class="pick" [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" />
        }
        @if (preview(); as s) {
          <path class="dim" [attr.d]="s.d" />
          <text
            class="value"
            data-testid="dimension-value"
            [attr.x]="s.x"
            [attr.y]="s.y"
            [attr.transform]="s.t"
          >
            {{ s.text }}
          </text>
        }
        @if (ruler(); as m) {
          <line
            class="measure"
            [attr.x1]="m.a.x"
            [attr.y1]="m.a.y"
            [attr.x2]="m.b.x"
            [attr.y2]="m.b.y"
          />
          <text
            class="value"
            data-testid="measure-value"
            [attr.x]="m.b.x + 10"
            [attr.y]="m.b.y - 10"
          >
            {{ m.text }}
          </text>
        }
      </svg>
    }
  `,
  styles: `
    :host,
    .overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .hover {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 3;
      opacity: 0.6;
    }
    .pick {
      fill: var(--ai-handle-position);
    }
    .dim,
    .measure {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
    .measure {
      stroke-dasharray: 5 3;
    }
    .value {
      fill: var(--ai-handle-position);
      font: 600 12px var(--font-family, sans-serif);
      text-anchor: middle;
      paint-order: stroke;
      stroke: var(--color-bg, #fff);
      stroke-width: 3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DimensionOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly dimension = inject(DimensionTool);
  protected readonly measuring = inject(MeasureTool);

  private readonly map = computed(() => {
    const m = this.toView();
    return (p: { x: number; y: number }) => apply(m, p);
  });

  protected readonly hover = computed(() => {
    const h = this.dimension.hover();
    const map = this.map();
    if (!h) return null;
    if (h.draw.kind === 'circle') {
      const c = map(h.draw.c);
      const e = map({ x: h.draw.c.x + h.draw.r, y: h.draw.c.y });
      return { kind: 'circle' as const, c, r: Math.hypot(e.x - c.x, e.y - c.y) };
    }
    return { kind: 'segment' as const, a: map(h.draw.a), b: map(h.draw.b) };
  });

  protected readonly picks = computed(() => {
    const at = this.dimension.pending() ? null : this.dimension.at();
    return [...this.dimension.picks(), ...(at ? [at] : [])].map(this.map());
  });

  protected readonly preview = computed(() => {
    const p = this.dimension.pending();
    const at = this.dimension.at();
    if (!p || !at) return null;
    const input = this.dimension.input(p, at, this.dimension.diameter());
    const map = this.map();
    const o = map({ x: 0, y: 0 });
    const e = map({ x: 1, y: 0 });
    const zoom = Math.hypot(e.x - o.x, e.y - o.y) || 1;
    const value = dimensionShape(input);
    // in screen pixels: radii scale with the zoom, gaps and tips keep their screen size
    const s = dimensionShape(input, map, zoom);
    if (!s || !value) return null;
    return {
      d: dimensionPath(s, 8),
      text: value.text,
      x: s.label.x,
      y: s.label.y - 6,
      t: `rotate(${s.rotate} ${s.label.x} ${s.label.y})`,
    };
  });

  protected readonly ruler = computed(() => {
    const l = this.measuring.line();
    if (!l) return null;
    const m = measure(l.a, l.b);
    return {
      a: this.map()(l.a),
      b: this.map()(l.b),
      text: `${formatValue(m.distance)} · ${formatValue(m.angle)}°`,
    };
  });
}
