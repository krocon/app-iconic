import { gridSnap } from './snapping';
import { Point } from './view-transform';

/**
 * The grid hint (Marc, 27.10.2026): while Snap to Grid is on, the grid crossings near the pointer
 * are shown as dots that fade out towards the edge of a circle – the grid is not drawn over the
 * whole artboard. Sizes are SCREEN pixels, so the hint looks the same at every zoom. Pure.
 */

/** Below this cell size on screen the dots would only be a grey haze: no hint. */
export const GRID_HINT_MIN_CELL_PX = 6;
/** Radius of the hint at least, in screen pixels … */
export const GRID_HINT_RADIUS_PX = 72;
/** … and at least this many cells around the pointer when the cells are large. */
export const GRID_HINT_RADIUS_CELLS = 2.5;

export interface GridDot {
  /** The crossing in document units. */
  point: Point;
  /** 1 at the pointer, falling to 0 at the edge of the circle. */
  weight: number;
  /** The crossing the pointer would snap to (the nearest one). */
  nearest: boolean;
}

/**
 * The grid crossings within the hint circle around `pointer` (document units). `pxPerUnit` is the
 * zoom (screen pixels per document unit); `[]` when the cells are too small on screen.
 */
export function gridDotsNear(
  pointer: Point,
  origin: Point,
  step: number,
  pxPerUnit: number,
): GridDot[] {
  if (!(step > 0) || !(pxPerUnit > 0)) return [];
  const cellPx = step * pxPerUnit;
  if (cellPx < GRID_HINT_MIN_CELL_PX) return [];
  const radius = Math.max(GRID_HINT_RADIUS_PX, GRID_HINT_RADIUS_CELLS * cellPx) / pxPerUnit;
  const near = gridSnap(pointer, origin, step);
  const n = Math.ceil(radius / step);
  const dots: GridDot[] = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const point = { x: near.x + i * step, y: near.y + j * step };
      const d = Math.hypot(point.x - pointer.x, point.y - pointer.y) / radius;
      if (d >= 1) continue;
      dots.push({ point, weight: 1 - d * d, nearest: i === 0 && j === 0 });
    }
  }
  return dots;
}
