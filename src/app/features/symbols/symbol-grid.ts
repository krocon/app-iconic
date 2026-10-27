/**
 * Keyboard of the symbol grid (design 013 E20), pure: ←/→ one tile, ↑/↓ one row, Home/End,
 * PageUp/PageDown four rows; clamped to the tiles. `null` = not a grid key.
 */
export const GRID_COLUMNS = 8;

export function gridMove(
  index: number,
  key: string,
  count: number,
  cols = GRID_COLUMNS,
): number | null {
  if (count <= 0) return null;
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowRight':
      return clamp(index + 1);
    case 'ArrowLeft':
      return clamp(index - 1);
    case 'ArrowDown':
      return clamp(index + cols);
    case 'ArrowUp':
      return clamp(index - cols);
    case 'PageDown':
      return clamp(index + 4 * cols);
    case 'PageUp':
      return clamp(index - 4 * cols);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
