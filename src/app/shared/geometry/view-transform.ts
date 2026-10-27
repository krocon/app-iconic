import { CANVAS_SIZE } from './icon-guides';

/** A point in some 2-D space (document units or viewport pixels). */
export interface Point {
  x: number;
  y: number;
}

/**
 * The view of the canvas (design 004 E11): document point `p` appears at viewport pixel
 * `p · zoom + pan` (viewport = the canvas area below the rulers, origin top left). Pure; the DOM
 * applies it as size (`1024 · zoom`) and `translate(pan)` of the artboard, and the browser's CTMs
 * (`dom-geometry.ts`) measure what is really on screen.
 */
export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export function documentToView(t: ViewTransform, p: Point): Point {
  return { x: p.x * t.zoom + t.panX, y: p.y * t.zoom + t.panY };
}

export function viewToDocument(t: ViewTransform, p: Point): Point {
  return { x: (p.x - t.panX) / t.zoom, y: (p.y - t.panY) / t.zoom };
}

/** The transform with `zoom` that keeps the document point under the viewport pixel `anchor`. */
export function zoomAround(t: ViewTransform, zoom: number, anchor: Point): ViewTransform {
  const f = zoom / t.zoom;
  return {
    zoom,
    panX: anchor.x - (anchor.x - t.panX) * f,
    panY: anchor.y - (anchor.y - t.panY) * f,
  };
}

/** The artboard in the middle of a viewport of `viewW × viewH` pixels (whole pixels: sharp guides). */
export function centered(
  viewW: number,
  viewH: number,
  zoom: number,
  size = CANVAS_SIZE,
): ViewTransform {
  return {
    zoom,
    panX: Math.round((viewW - size * zoom) / 2),
    panY: Math.round((viewH - size * zoom) / 2),
  };
}

/** Keeps at least `keep` pixels of the artboard (or all of it, if smaller) inside the viewport. */
export function clampPan(
  t: ViewTransform,
  viewW: number,
  viewH: number,
  size = CANVAS_SIZE,
  keep = 64,
): ViewTransform {
  const s = size * t.zoom;
  const k = Math.min(keep, s);
  const clamp = (v: number, view: number) => Math.min(Math.max(v, k - s), view - k);
  return { zoom: t.zoom, panX: clamp(t.panX, viewW), panY: clamp(t.panY, viewH) };
}
