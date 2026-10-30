import { DialogAnchor } from './dialog.service';

/** Gap between the opener and the popover. */
const GAP = 8;
/** Distance to the window's edges. */
const MARGIN = 8;

/**
 * Where a popover goes (prompt 073 E3), pure: beside a small opener (a button, a field) – to its
 * left when it sits on the right half of the window (the properties panel), else to its right –
 * top aligned; inside a big opener (the canvas, a shortcut without a button) at its top right.
 * Always inside the window.
 */
export function popoverPosition(
  anchor: DialogAnchor | null,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.max(MARGIN, Math.min(v, max - MARGIN));
  if (!anchor) {
    return { left: clamp(view.width - size.width - 3 * MARGIN, view.width - size.width), top: 72 };
  }
  const w = anchor.right - anchor.left;
  const h = anchor.bottom - anchor.top;
  let left: number;
  let top: number;
  if (w > 360 || h > 360) {
    left = anchor.right - size.width - 2 * MARGIN;
    top = anchor.top + 2 * MARGIN;
  } else if ((anchor.left + anchor.right) / 2 > view.width / 2) {
    left = anchor.left - GAP - size.width;
    top = anchor.top;
  } else {
    left = anchor.right + GAP;
    top = anchor.top;
  }
  return {
    left: clamp(left, view.width - size.width),
    top: clamp(top, view.height - size.height),
  };
}
