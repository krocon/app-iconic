import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { CANVAS_SIZE, iconGuides } from '../../shared/geometry/icon-guides';
import { squirclePath } from '../../shared/geometry/squircle';
import { documentToView, Point } from '../../shared/geometry/view-transform';
import { zoomPercent } from '../../shared/geometry/zoom-steps';
import { DocumentStore } from '../document/document.store';
import { ProvisionalShortcuts } from '../files/provisional-shortcuts';
import { CanvasBackground } from './canvas-background';
import { CanvasRuler } from './canvas-ruler';
import { CANVAS_TEXTS } from './canvas-texts';
import { CanvasToolbar } from './canvas-toolbar';
import { CanvasViewStore } from './canvas-view.store';
import { fillPreview } from './fill-preview';
import { LayerStack } from './layer-stack';

/** Ctrl+wheel / pinch: zoom factor per wheel pixel (design 004 E9). */
const WHEEL_ZOOM = 0.01;

/**
 * The canvas (prompt 004): toolbar, rulers, the artboard with background, the live layers
 * (`LayerStack`), platform mask, the overlay host `<svg>` with the icon guides, cross cursor and
 * the status line with pointer position and zoom. Zoom/pan state in the `CanvasViewStore`.
 */
@Component({
  selector: 'app-canvas-view',
  imports: [CanvasBackground, CanvasRuler, CanvasToolbar],
  template: `
    <app-canvas-toolbar />
    <div class="frame" [class.rulers]="opt().rulers">
      @if (opt().rulers) {
        <div class="corner" aria-hidden="true"></div>
        <app-canvas-ruler
          class="ruler-x"
          orientation="horizontal"
          [view]="view()"
          [length]="viewport().width"
          [marker]="pointerView()?.x ?? null"
        />
        <app-canvas-ruler
          class="ruler-y"
          orientation="vertical"
          [view]="view()"
          [length]="viewport().height"
          [marker]="pointerView()?.y ?? null"
        />
      }
      <div
        #vp
        class="viewport"
        role="img"
        tabindex="0"
        [attr.aria-label]="t.canvas"
        [class.cross]="opt().crossCursor"
        [class.can-pan]="space()"
        [class.panning]="panning()"
        (wheel)="onWheel($event)"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="endPan($event)"
        (pointercancel)="endPan($event)"
        (pointerleave)="onPointerLeave()"
        (auxclick)="$event.preventDefault()"
      >
        <div
          class="artboard"
          [class.unmasked]="opt().mask === 'none'"
          [style.width.px]="px()"
          [style.height.px]="px()"
          [style.transform]="translate()"
        >
          <div class="paper" [class.transparent]="!opt().background" [style.clip-path]="clip()">
            @if (opt().background) {
              <app-canvas-background [fill]="fill().preview" />
            }
            <div #layers class="layers"></div>
          </div>
          <svg
            #host
            class="host"
            data-testid="canvas-host"
            [attr.viewBox]="'0 0 ' + size + ' ' + size"
            aria-hidden="true"
          >
            @if (opt().guides) {
              <g class="guides">
                @for (l of guides.lines; track $index) {
                  <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" />
                }
                @for (c of guides.circles; track $index) {
                  <circle [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="c.r" />
                }
              </g>
            }
          </svg>
        </div>
        @if (opt().crossCursor && pointerView(); as p) {
          <div class="cross-h" [style.top.px]="p.y"></div>
          <div class="cross-v" [style.left.px]="p.x"></div>
        }
      </div>
    </div>
    <div class="status">
      <span class="coords" data-testid="canvas-coords" [attr.aria-label]="t.position">
        X {{ coord(pointer()?.x) }} &nbsp; Y {{ coord(pointer()?.y) }}
      </span>
      @if (!fill().known) {
        <span class="hint">{{ t.unknownFill }}</span>
      }
      <span class="spacer"></span>
      <span class="zoom" data-testid="canvas-zoom">{{ percent() }}</span>
    </div>
  `,
  styleUrl: './canvas-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasView {
  readonly store = input<DocumentStore | null>(null);
  protected readonly canvas = inject(CanvasViewStore);
  protected readonly t = CANVAS_TEXTS;
  protected readonly size = CANVAS_SIZE;
  protected readonly guides = iconGuides();
  protected readonly opt = this.canvas.options;
  protected readonly view = this.canvas.view;
  protected readonly viewport = this.canvas.viewport;
  protected readonly pointer = this.canvas.pointer;
  protected readonly px = this.canvas.artboardPx;
  protected readonly space = signal(false);
  protected readonly panning = signal(false);
  protected readonly percent = computed(() => zoomPercent(this.canvas.zoom()));
  protected readonly translate = computed(() => {
    const v = this.view();
    return `translate(${v.panX}px, ${v.panY}px)`;
  });
  protected readonly pointerView = computed(() => {
    const p = this.pointer();
    return p ? documentToView(this.view(), p) : null;
  });
  protected readonly fill = computed(() => {
    const doc = this.store()?.document();
    return fillPreview(doc?.iconJson ?? {}, this.opt().appearance);
  });
  protected readonly clip = computed(() => {
    const mask = this.opt().mask;
    if (mask === 'circle') return 'circle(50%)';
    if (mask === 'squircle') return `path('${squirclePath(this.px())}')`;
    return null;
  });

  private readonly viewportEl = viewChild.required<ElementRef<HTMLElement>>('vp');
  private readonly layersEl = viewChild.required<ElementRef<HTMLElement>>('layers');
  private readonly hostEl = viewChild.required<ElementRef<SVGSVGElement>>('host');
  private stack: LayerStack | null = null;
  private pan: { id: number; x: number; y: number } | null = null;
  private lastClient: { clientX: number; clientY: number } | null = null;

  constructor() {
    effect(() => {
      const box = this.layersEl().nativeElement;
      this.stack ??= new LayerStack(box);
      this.stack.update(this.store()?.document() ?? null, this.opt().appearance);
    });
    // the pointer stays on the same screen spot while zooming/panning: recompute its document point
    effect(() => {
      this.view();
      if (this.lastClient) queueMicrotask(() => this.track(this.lastClient));
    });
    const destroy = inject(DestroyRef);
    const unregister = inject(ProvisionalShortcuts).register({
      '=': () => this.canvas.zoomIn(),
      '+': () => this.canvas.zoomIn(),
      'shift+=': () => this.canvas.zoomIn(),
      'shift++': () => this.canvas.zoomIn(),
      '-': () => this.canvas.zoomOut(),
      'shift+-': () => this.canvas.zoomOut(),
      '0': () => this.canvas.actualSize(),
    });
    destroy.onDestroy(unregister);
    afterNextRender(() => {
      const el = this.viewportEl().nativeElement;
      this.canvas.host = this.hostEl().nativeElement;
      const ro = new ResizeObserver(([e]) =>
        this.canvas.setViewport(e.contentRect.width, e.contentRect.height),
      );
      ro.observe(el);
      const key = (e: KeyboardEvent) => this.onSpace(e);
      document.addEventListener('keydown', key);
      document.addEventListener('keyup', key);
      destroy.onDestroy(() => {
        ro.disconnect();
        document.removeEventListener('keydown', key);
        document.removeEventListener('keyup', key);
        if (this.canvas.host === this.hostEl().nativeElement) this.canvas.host = null;
      });
    });
  }

  protected coord(v: number | undefined): string {
    return v === undefined || !Number.isFinite(v) ? this.t.outside : v.toFixed(1);
  }

  /** Viewport pixel of a client position. */
  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.viewportEl().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private track(e: { clientX: number; clientY: number } | null): void {
    this.pointer.set(e ? clientToDocument(this.hostEl().nativeElement, e) : null);
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) {
      this.canvas.zoomBy(Math.exp(-e.deltaY * scale * WHEEL_ZOOM), this.local(e));
    } else if (e.shiftKey && e.deltaX === 0) {
      this.canvas.panBy(-e.deltaY * scale, 0);
    } else {
      this.canvas.panBy(-e.deltaX * scale, -e.deltaY * scale);
    }
  }

  protected onPointerDown(e: PointerEvent): void {
    if (e.button !== 1 && !(e.button === 0 && this.space())) return;
    e.preventDefault();
    this.viewportEl().nativeElement.setPointerCapture?.(e.pointerId);
    this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.panning.set(true);
  }

  protected onPointerMove(e: PointerEvent): void {
    this.lastClient = { clientX: e.clientX, clientY: e.clientY };
    if (this.pan && this.pan.id === e.pointerId) {
      this.canvas.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    this.track(this.lastClient);
  }

  protected endPan(e: PointerEvent): void {
    if (!this.pan || this.pan.id !== e.pointerId) return;
    this.viewportEl().nativeElement.releasePointerCapture?.(e.pointerId);
    this.pan = null;
    this.panning.set(false);
  }

  protected onPointerLeave(): void {
    if (this.pan) return;
    this.lastClient = null;
    this.track(null);
  }

  /**
   * Space held = pan with the left button (provisional until 005, design 004 E15) – while the
   * pointer is over the canvas or the canvas has the focus, not while typing in a field.
   */
  private onSpace(e: KeyboardEvent): void {
    if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.type === 'keydown') {
      if (!this.lastClient && e.target !== this.viewportEl().nativeElement) return;
      e.preventDefault();
      this.space.set(true);
    } else if (this.space()) {
      e.preventDefault();
      this.space.set(false);
    }
  }
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
