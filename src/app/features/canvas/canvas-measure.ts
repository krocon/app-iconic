import { DestroyRef, effect, Signal, untracked, WritableSignal } from '@angular/core';
import { fromDom, IDENTITY, Matrix, multiply, translation } from '../../shared/geometry/matrix';
import { ClipEditLayer } from '../clip/clip-edit-layer';
import { ClipEditStore } from '../clip/clip-edit.store';
import { DocumentStore } from '../document/document.store';
import { CanvasEditStore } from './canvas-edit.store';
import { CanvasViewStore } from './canvas-view.store';
import { EMPTY_MODEL, measureSelection } from './selection-measure';

/**
 * Measuring for the `CanvasView` (split from `canvas-view.ts` in prompt 033, behaviour unchanged):
 * the selection model and the document → viewport matrix after every change, and the elements
 * the `CanvasViewStore` hands to the tools.
 */
export interface MeasureInputs {
  store: Signal<DocumentStore | null>;
  view: Signal<unknown>;
  viewport: Signal<unknown>;
  options: CanvasViewStore['options'];
  clipEdit: ClipEditStore;
  host: () => SVGSVGElement;
  viewportEl: () => HTMLElement;
  toView: WritableSignal<Matrix>;
  edit: CanvasEditStore;
}

/** Document → viewport pixels from the browser's matrix of the host. */
export function measureView(host: SVGSVGElement, viewport: HTMLElement): Matrix {
  const m = host.getScreenCTM?.();
  if (!m) return IDENTITY;
  const r = viewport.getBoundingClientRect();
  return multiply(translation(-r.left, -r.top), fromDom(m));
}

/**
 * The selection (frames, handles) measured after the layers are painted (needs layout): again
 * after changes, zoom/pan, options and the viewport size – once per frame. Call in an injection
 * context.
 */
export function measureEachChange(i: MeasureInputs): void {
  let frame = 0;
  let clipLayer: ClipEditLayer | null = null;
  effect(() => {
    const s = i.store();
    const refs = s?.selection() ?? [];
    s?.revision();
    i.view();
    i.viewport();
    const o = i.options();
    i.clipEdit.target();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const doc = s?.document();
      const host = i.host();
      const scope = untracked(() => i.clipEdit.scope(doc));
      i.toView.set(measureView(host, i.viewportEl()));
      i.edit.model.set(
        doc ? measureSelection(doc, host, refs, o.selectionMode, o.handles, scope) : EMPTY_MODEL,
      );
      (clipLayer ??= new ClipEditLayer(host)).update(scope);
    });
  });
}

/** Hands host and layers to the `CanvasViewStore` and follows the viewport's size. */
export function connectCanvas(
  canvas: CanvasViewStore,
  viewport: HTMLElement,
  host: SVGSVGElement,
  layers: HTMLElement,
  destroy: DestroyRef,
): void {
  canvas.host = host;
  canvas.layers = layers;
  const ro = new ResizeObserver(([e]) =>
    canvas.setViewport(e.contentRect.width, e.contentRect.height),
  );
  ro.observe(viewport);
  destroy.onDestroy(() => {
    ro.disconnect();
    if (canvas.host === host) canvas.host = null;
    if (canvas.layers === layers) canvas.layers = null;
  });
}
