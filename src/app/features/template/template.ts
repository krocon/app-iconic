import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';

/**
 * The template of the canvas (prompt 087 E12): an image to trace or rebuild by hand – shown over
 * the layers, never part of the document, its undo or its export. Pure.
 */
export interface TemplateImage {
  /** File or asset name (shown, and the stem of a traced layer). */
  name: string;
  /** `data:image/png;base64,…` (JPEG/WebP/SVG converted when set). */
  dataUrl: string;
  width: number;
  height: number;
}

export interface TemplateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opacity of a new template and its range. */
export const TEMPLATE_OPACITY = { initial: 0.5, min: 0.05, max: 1 } as const;

/** Icon units per image pixel: the longer side fills the canvas (up or down). */
export function fitScale(width: number, height: number, size = CANVAS_SIZE): number {
  const long = Math.max(width, height);
  return long > 0 ? size / long : 1;
}

/** Where the template lies: fitted into the canvas, centred (like a traced layer, E13). */
export function templatePlacement(width: number, height: number, size = CANVAS_SIZE): TemplateRect {
  const s = fitScale(width, height, size);
  const w = width * s;
  const h = height * s;
  return { x: (size - w) / 2, y: (size - h) / 2, width: w, height: h };
}

export function clampOpacity(v: number): number {
  if (!Number.isFinite(v)) return TEMPLATE_OPACITY.initial;
  return Math.min(TEMPLATE_OPACITY.max, Math.max(TEMPLATE_OPACITY.min, v));
}

/** A placement in percent of the canvas (the overlay's CSS). */
export function percentOf(r: TemplateRect, size = CANVAS_SIZE): TemplateRect {
  const p = (v: number) => (v / size) * 100;
  return { x: p(r.x), y: p(r.y), width: p(r.width), height: p(r.height) };
}
