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
import { clientToDocument, Rect } from '../../shared/geometry/dom-geometry';
import { measurable } from '../hierarchy/align';
import { CANVAS_SIZE, iconGuides } from '../../shared/geometry/icon-guides';
import { squirclePath } from '../../shared/geometry/squircle';
import { documentToView, Point } from '../../shared/geometry/view-transform';
import { zoomPercent } from '../../shared/geometry/zoom-steps';
import { DocumentStore } from '../document/document.store';
import { ActionService } from '../../core/actions/action.service';
import { canvasActions } from './canvas-actions';
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
            <g class="selection">
              @for (r of selectionRects(); track $index) {
                <rect
                  [attr.x]="r.x"
                  [attr.y]="r.y"
                  [attr.width]="r.width"
                  [attr.height]="r.height"
                  vector-effect="non-scaling-stroke"
                />
              }
            </g>
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

  /** Bounds of the selected nodes (design 006 E5: the canvas shows the tree's selection). */
  protected readonly selectionRects = signal<Rect[]>([]);

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
    // selection frames: measured after the layers are painted (needs layout)
    let frame = 0;
    effect(() => {
      const s = this.store();
      const refs = s?.selection() ?? [];
      // re-measure after changes, zoom/pan and appearance (other assets)
      s?.revision();
      this.view();
      this.opt();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = s?.document();
        const host = this.hostEl().nativeElement;
        this.selectionRects.set(doc ? measurable(doc, host, refs).map((n) => n.rect) : []);
      });
    });
    // the pointer stays on the same screen spot while zooming/panning: recompute its document point
    effect(() => {
      this.view();
      if (this.lastClient) queueMicrotask(() => this.track(this.lastClient));
    });
    const destroy = inject(DestroyRef);
    // zoom, view options … and Space held = pan (design 005 E16: actions instead of listeners)
    const actions = inject(ActionService);
    actions.registerAll(canvasActions(this.canvas), destroy);
    actions.register(
      'canvas.panHold',
      {
        // over the canvas or with the focus on it
        enabled: () => this.lastClient !== null || this.focused(),
        run: () => this.space.set(true),
        release: () => this.space.set(false),
      },
      destroy,
    );
    afterNextRender(() => {
      const el = this.viewportEl().nativeElement;
      this.canvas.host = this.hostEl().nativeElement;
      const ro = new ResizeObserver(([e]) =>
        this.canvas.setViewport(e.contentRect.width, e.contentRect.height),
      );
      ro.observe(el);
      destroy.onDestroy(() => {
        ro.disconnect();
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

  /** The viewport has the keyboard focus (Space pans then too). */
  private focused(): boolean {
    const el = this.viewportEl().nativeElement;
    return el.ownerDocument.activeElement === el;
  }
}
