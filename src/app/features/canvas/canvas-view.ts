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
  untracked,
  viewChild,
} from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { fromDom, IDENTITY, Matrix, multiply, translation } from '../../shared/geometry/matrix';
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
import { CanvasEditStore } from './canvas-edit.store';
import { registerCanvasEditActions } from './canvas-edit-actions';
import { CanvasInteraction } from './canvas-pointer';
import { EMPTY_MODEL, measureSelection } from './selection-measure';
import { SelectionOverlay } from './selection-overlay';

/** Ctrl+wheel / pinch: zoom factor per wheel pixel (design 004 E9). */
const WHEEL_ZOOM = 0.01;

/**
 * The canvas (prompt 004): toolbar, rulers, the artboard with background, the live layers
 * (`LayerStack`), platform mask, the overlay host `<svg>` with the icon guides, cross cursor and
 * the status line with pointer position and zoom. Zoom/pan state in the `CanvasViewStore`.
 */
@Component({
  selector: 'app-canvas-view',
  imports: [CanvasBackground, CanvasRuler, CanvasToolbar, SelectionOverlay],
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
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerCancel($event)"
        (dblclick)="onDblClick($event)"
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
        <app-selection-overlay
          [model]="edit.model()"
          [toView]="toView()"
          [marquee]="edit.marquee()"
          [snap]="edit.snap()"
          [active]="edit.activePoint()"
        />
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

  /** Editing state: selection model, marquee, snap, context (design 007 E15). */
  protected readonly edit = inject(CanvasEditStore);
  /** Document → viewport pixels, measured with the host's screen CTM (design 007 E5). */
  protected readonly toView = signal<Matrix>(IDENTITY);

  private readonly viewportEl = viewChild.required<ElementRef<HTMLElement>>('vp');
  private readonly layersEl = viewChild.required<ElementRef<HTMLElement>>('layers');
  private readonly hostEl = viewChild.required<ElementRef<SVGSVGElement>>('host');
  private stack: LayerStack | null = null;
  private pan: { id: number; x: number; y: number } | null = null;
  private lastClient: { clientX: number; clientY: number } | null = null;
  private readonly interaction: CanvasInteraction;

  constructor() {
    effect(() => {
      const box = this.layersEl().nativeElement;
      this.stack ??= new LayerStack(box);
      this.stack.update(this.store()?.document() ?? null, this.opt().appearance);
    });
    // the selection (frames, handles): measured after the layers are painted (needs layout)
    let frame = 0;
    effect(() => {
      const s = this.store();
      const refs = s?.selection() ?? [];
      // re-measure after changes, zoom/pan, options and the viewport size
      s?.revision();
      this.view();
      this.viewport();
      const o = this.opt();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = s?.document();
        const host = this.hostEl().nativeElement;
        this.toView.set(this.measureView());
        this.edit.model.set(
          doc ? measureSelection(doc, host, refs, o.selectionMode, o.handles) : EMPTY_MODEL,
        );
      });
    });
    // a selection made elsewhere (tree, AI) outside the group context leaves it; the chosen
    // point goes with its node
    effect(() => {
      const s = this.store();
      const refs = s?.selection() ?? [];
      const p = untracked(() => this.edit.activePoint());
      if (p && !refs.some((r) => r.asset === p.ref.asset && r.id === p.ref.id)) {
        this.edit.activePoint.set(null);
      }
      const ctx = this.edit.context();
      if (!ctx) return;
      const el = s?.document().node(ctx);
      const inside =
        !!el && refs.every((r) => r.asset === ctx.asset && el.contains(s!.document().node(r)));
      if (!inside) this.edit.context.set(null);
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
    registerCanvasEditActions(
      actions,
      () => this.store(),
      this.edit,
      () => this.canvas.host,
      destroy,
    );
    this.interaction = new CanvasInteraction(
      () => this.store(),
      this.canvas,
      this.edit,
      () => this.hostEl().nativeElement,
      () => this.layersEl().nativeElement,
      actions.os === 'mac',
    );
    destroy.onDestroy(() => this.edit.gesture.cancel());
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
      this.canvas.layers = this.layersEl().nativeElement;
      const ro = new ResizeObserver(([e]) =>
        this.canvas.setViewport(e.contentRect.width, e.contentRect.height),
      );
      ro.observe(el);
      destroy.onDestroy(() => {
        ro.disconnect();
        if (this.canvas.host === this.hostEl().nativeElement) this.canvas.host = null;
        if (this.canvas.layers === this.layersEl().nativeElement) this.canvas.layers = null;
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
    const vp = this.viewportEl().nativeElement;
    if (e.button === 0 && !this.space()) {
      // select, drag a handle, move, marquee (design 007)
      vp.focus({ preventScroll: true });
      if (this.interaction.down(e, e.target instanceof Element ? e.target : null)) {
        e.preventDefault();
        vp.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    if (e.button !== 1 && !(e.button === 0 && this.space())) return;
    e.preventDefault();
    vp.setPointerCapture?.(e.pointerId);
    this.pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.panning.set(true);
  }

  protected onPointerUp(e: PointerEvent): void {
    this.interaction.up(e);
    this.endPan(e);
  }

  protected onPointerCancel(e: PointerEvent): void {
    this.edit.gesture.cancel();
    this.endPan(e);
  }

  protected onDblClick(e: MouseEvent): void {
    this.interaction.dblclick({ ...pointerOf(e), pointerId: 0 });
  }

  /** Document → viewport pixels from the browser's matrix of the host. */
  private measureView(): Matrix {
    const m = this.hostEl().nativeElement.getScreenCTM?.();
    if (!m) return IDENTITY;
    const r = this.viewportEl().nativeElement.getBoundingClientRect();
    return multiply(translation(-r.left, -r.top), fromDom(m));
  }

  protected onPointerMove(e: PointerEvent): void {
    this.lastClient = { clientX: e.clientX, clientY: e.clientY };
    this.interaction.move(e);
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

function pointerOf(e: MouseEvent) {
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
  };
}
