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
import { CANVAS_SIZE, guidesOf } from '../../shared/geometry/icon-guides';
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
import { GridHintInput, GridHintOverlay } from './grid-hint-overlay';
import { gridOriginPoint } from '../../shared/geometry/snapping';
import { FreehandOverlay } from '../tools/freehand-overlay';
import { FreehandStore } from '../tools/freehand.store';
import { FreehandService } from '../tools/freehand.service';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { ClipEditStore } from '../clip/clip-edit.store';
import { ClipEditLayer } from '../clip/clip-edit-layer';
import { CLIP_TEXTS } from '../clip/clip-texts';
import { SketchTool } from '../sketch/sketch-tool';
import { PenTool } from '../pen/pen-tool';
import { CurvatureTool } from '../pen/curvature-tool';
import { CurvatureStore } from '../pen/curvature.store';
import { PenStore } from '../pen/pen.store';
import { PenOverlay } from '../pen/pen-overlay';
import { ToolOverlays } from './tool-overlays';
import { GradientOverlay } from '../gradient/gradient-overlay';
import { ConstraintOverlay } from '../constraints/constraint-overlay';
import { CanvasTools } from './canvas-tools';
import { followSelection } from './follow-selection';
import { SketchOverlay } from '../sketch/sketch-overlay';
import { SketchStore } from '../sketch/sketch.store';

/** Ctrl+wheel / pinch: zoom factor per wheel pixel (design 004 E9). */
const WHEEL_ZOOM = 0.01;

/**
 * The canvas (prompt 004): toolbar, rulers, the artboard with background, the live layers
 * (`LayerStack`), platform mask, the overlay host `<svg>` with the icon guides, cross cursor and
 * the status line with pointer position and zoom. Zoom/pan state in the `CanvasViewStore`.
 */
@Component({
  selector: 'app-canvas-view',
  imports: [
    CanvasBackground,
    CanvasRuler,
    CanvasToolbar,
    FreehandOverlay,
    GridHintOverlay,
    SelectionOverlay,
    SketchOverlay,
    PenOverlay,
    ToolOverlays,
    GradientOverlay,
    ConstraintOverlay,
  ],
  templateUrl: './canvas-view.html',
  styleUrl: './canvas-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasView {
  readonly store = input<DocumentStore | null>(null);
  protected readonly canvas = inject(CanvasViewStore);
  protected readonly t = CANVAS_TEXTS;
  protected readonly size = CANVAS_SIZE;
  protected readonly guides = computed(() =>
    guidesOf(this.opt().guideTemplate, this.opt().guideDivisions),
  );
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
  /** The grid near the pointer, only while Snap to Grid is on (not while panning or drawing). */
  protected readonly gridHint = computed((): GridHintInput | null => {
    const o = this.opt();
    const pointer = this.pointer();
    if (!o.snapToGrid || !pointer || this.panning() || this.freehand.active()) return null;
    return { pointer, origin: gridOriginPoint(o.gridOrigin), step: o.gridSize };
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
  /** The freehand tool (design 013 E3): while on, dragging draws instead of selecting. */
  protected readonly freehand = inject(FreehandStore);
  private readonly freehandService = inject(FreehandService);
  /** The sketch tools (design 019 E3): while one is on, clicks place its steps. */
  protected readonly sketch = inject(SketchStore);
  /** The tool modes (sketch, pen, curvature …): the active one gets the left button. */
  protected readonly tools = inject(CanvasTools);
  /** Created here so that they register with `CanvasTools` (root services). */
  private readonly sketchTool = inject(SketchTool);
  private readonly penTool = inject(PenTool);
  private readonly curvatureTool = inject(CurvatureTool);
  protected readonly curvature = inject(CurvatureStore);
  protected readonly pen = inject(PenStore);
  protected readonly tt = TOOLS_TEXTS;
  /** The clip path edit mode (design 014 E7). */
  protected readonly clipEdit = inject(ClipEditStore);
  protected readonly ct = CLIP_TEXTS;
  /** The id of the clip being edited (banner), `null` outside the mode. */
  protected readonly clipId = computed(() => {
    const el = this.clipEdit.scope(this.store()?.document());
    return el ? (el.getAttribute('id') ?? '') : null;
  });
  private clipLayer: ClipEditLayer | null = null;
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
      const o = this.opt();
      this.stack.update(this.store()?.document() ?? null, o.appearance, o.effects);
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
      this.clipEdit.target();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const doc = s?.document();
        const host = this.hostEl().nativeElement;
        const scope = untracked(() => this.clipEdit.scope(doc));
        this.toView.set(this.measureView());
        this.edit.model.set(
          doc ? measureSelection(doc, host, refs, o.selectionMode, o.handles, scope) : EMPTY_MODEL,
        );
        (this.clipLayer ??= new ClipEditLayer(host)).update(scope);
      });
    });
    followSelection(this.store, this.edit, this.clipEdit);
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
      // the tool first (freehand or sketch): its stroke / shape, then the tool
      {
        escape: () => this.tools.escape() || this.freehand.escape(),
        active: () => !!this.tools.current() || this.freehand.active(),
      },
      {
        scope: () => this.clipEdit.scope(this.store()?.document()),
        exit: () => this.clipEdit.exit(),
      },
    );
    this.interaction = new CanvasInteraction(
      () => this.store(),
      this.canvas,
      this.edit,
      () => this.hostEl().nativeElement,
      () => this.layersEl().nativeElement,
      actions.os === 'mac',
      () => this.clipEdit.target(),
    );
    destroy.onDestroy(() => {
      this.edit.gesture.cancel();
      this.freehand.cancel();
      for (const t of this.tools.all()) t.reset?.();
    });
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

  private toDoc(e: { clientX: number; clientY: number }): Point {
    return clientToDocument(this.hostEl().nativeElement, e);
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
    const tool = this.tools.current();
    if (e.button === 0 && !this.space() && tool) {
      // the tool mode (sketch steps, pen anchors …); a sketch's fields take the focus after it
      vp.focus({ preventScroll: true });
      e.preventDefault();
      vp.setPointerCapture?.(e.pointerId);
      tool.press(e);
      return;
    }
    if (e.button === 0 && !this.space() && this.freehand.active()) {
      // draw (design 013 E3)
      vp.focus({ preventScroll: true });
      e.preventDefault();
      vp.setPointerCapture?.(e.pointerId);
      this.freehand.begin(this.toDoc(e), e.timeStamp);
      return;
    }
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
    if (this.freehand.drawing()) {
      const stroke = this.freehand.finish(this.toDoc(e), this.canvas.zoom());
      if (stroke) void this.freehandService.insertStroke(stroke);
    }
    for (const t of this.tools.all()) t.release(e);
    this.interaction.up(e);
    this.endPan(e);
  }

  protected onPointerCancel(e: PointerEvent): void {
    this.freehand.cancel();
    for (const t of this.tools.all()) t.leave();
    this.edit.gesture.cancel();
    this.endPan(e);
  }

  protected onDblClick(e: MouseEvent): void {
    const tool = this.tools.current();
    if (tool) tool.dblclick?.({ ...pointerOf(e), pointerId: 0 });
    if (tool || this.freehand.active()) return;
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
    if (this.freehand.drawing()) {
      // every coalesced sample of the frame (fast strokes stay smooth)
      const list = e.getCoalescedEvents?.() ?? [];
      for (const c of list.length ? list : [e]) {
        this.freehand.sample(this.toDoc(c), c.timeStamp, this.canvas.zoom());
      }
    }
    const tool = this.tools.current();
    if (tool) tool.move(e);
    else this.interaction.move(e);
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
    for (const t of this.tools.all()) t.leave();
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
