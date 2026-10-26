import { CANVAS_SIZE } from './icon-guides';

/** Zoom levels of the legacy app (legacy §5: index 0…8, default 5 = 100 %). */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2] as const;
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const EPS = 1e-6;

export function clampZoom(z: number): number {
  return Number.isFinite(z) ? Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM) : 1;
}

/** The first step above `z` (also when `z` lies between steps, e.g. after a pinch). */
export function nextZoomStep(z: number): number {
  return ZOOM_STEPS.find((s) => s > z + EPS) ?? MAX_ZOOM;
}

/** The last step below `z`. */
export function prevZoomStep(z: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < z - EPS) ?? MIN_ZOOM;
}

/** The largest step ≤ 100 % at which the artboard fits with `margin` px on every side. */
export function fitZoom(viewW: number, viewH: number, size = CANVAS_SIZE, margin = 32): number {
  const room = Math.min(viewW, viewH) - 2 * margin;
  return [...ZOOM_STEPS].reverse().find((s) => s <= 1 && size * s <= room + EPS) ?? MIN_ZOOM;
}

/** "100 %", "66 %", "137 %" – the zoom as shown to the user. */
export function zoomPercent(z: number): string {
  return `${Math.round(z * 100)} %`;
}
