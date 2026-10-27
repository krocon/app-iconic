import { PANEL_MAX, PANEL_MIN } from '../../core/settings/settings.models';

/**
 * Width of a side panel (design 015 E10, legacy §9: 160…480 px). Pure: the splitter and the
 * `LayoutStore` use it.
 */

/** Which edge of the panel the splitter sits on: `end` = right of a left panel (commands, hierarchy). */
export type SplitterSide = 'end' | 'start';

export const KEY_STEP = 10;
export const KEY_STEP_BIG = 40;

export function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return PANEL_MIN;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(px)));
}

/** The width after dragging the splitter by `dx` CSS pixels from `start`. */
export function dragWidth(start: number, dx: number, side: SplitterSide): number {
  return clampWidth(side === 'end' ? start + dx : start - dx);
}

/**
 * The width after a key on the focused splitter (APG window splitter): ←/→ move the splitter
 * (10 px, ⇧ 40 px), Home/End = smallest / largest; `null` = not a splitter key.
 */
export function keyWidth(
  width: number,
  key: string,
  shift: boolean,
  side: SplitterSide,
): number | null {
  const step = shift ? KEY_STEP_BIG : KEY_STEP;
  // the splitter moves with the arrow; on the left edge of a right panel that widens it
  const sign = side === 'end' ? 1 : -1;
  switch (key) {
    case 'ArrowRight':
      return clampWidth(width + sign * step);
    case 'ArrowLeft':
      return clampWidth(width - sign * step);
    case 'Home':
      return PANEL_MIN;
    case 'End':
      return PANEL_MAX;
    default:
      return null;
  }
}
