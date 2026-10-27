import { gridMove } from './symbol-grid';

describe('gridMove', () => {
  it('moves by tile and row, clamped', () => {
    expect(gridMove(0, 'ArrowRight', 20, 8)).toBe(1);
    expect(gridMove(0, 'ArrowLeft', 20, 8)).toBe(0);
    expect(gridMove(3, 'ArrowDown', 20, 8)).toBe(11);
    expect(gridMove(15, 'ArrowDown', 20, 8)).toBe(19);
    expect(gridMove(3, 'ArrowUp', 20, 8)).toBe(0);
    expect(gridMove(5, 'Home', 20, 8)).toBe(0);
    expect(gridMove(5, 'End', 20, 8)).toBe(19);
    expect(gridMove(0, 'PageDown', 100, 8)).toBe(32);
    expect(gridMove(40, 'PageUp', 100, 8)).toBe(8);
  });

  it('ignores other keys and empty grids', () => {
    expect(gridMove(0, 'a', 20)).toBeNull();
    expect(gridMove(0, 'ArrowRight', 0)).toBeNull();
  });
});
