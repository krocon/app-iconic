import { GRID_HINT_RADIUS_PX, gridDotsNear } from './grid-hint';

describe('grid hint', () => {
  it('shows the crossings around the pointer, the nearest one marked', () => {
    const dots = gridDotsNear({ x: 23, y: 18 }, { x: 0, y: 0 }, 10, 1);
    const nearest = dots.filter((d) => d.nearest);
    expect(nearest.map((d) => d.point)).toEqual([{ x: 20, y: 20 }]);
    for (const d of dots) {
      expect(Number.isInteger(d.point.x / 10) && Number.isInteger(d.point.y / 10)).toBe(true);
      expect(Math.hypot(d.point.x - 23, d.point.y - 18)).toBeLessThan(GRID_HINT_RADIUS_PX);
      expect(d.weight).toBeGreaterThan(0);
      expect(d.weight).toBeLessThanOrEqual(1);
    }
    // a circle of radius 72 at spacing 10: about π · 7.2² ≈ 163 crossings
    expect(dots.length).toBeGreaterThan(140);
    expect(dots.length).toBeLessThan(190);
  });

  it('follows the origin', () => {
    const dots = gridDotsNear({ x: 509, y: 515 }, { x: 512, y: 512 }, 8, 1);
    expect(dots.find((d) => d.nearest)?.point).toEqual({ x: 512, y: 512 });
    const onGrid = (v: number) => Number.isInteger((v - 512) / 8);
    expect(dots.every((d) => onGrid(d.point.x) && onGrid(d.point.y))).toBe(true);
  });

  it('keeps its screen size at every zoom', () => {
    const at = (zoom: number) => gridDotsNear({ x: 100, y: 100 }, { x: 0, y: 0 }, 10, zoom).length;
    // zoom 2: cells of 20 px – fewer crossings in the same screen circle
    expect(at(2)).toBeLessThan(at(1));
    expect(at(1.5)).toBeLessThan(at(1));
  });

  it('shows nothing when the cells are too small on screen', () => {
    expect(gridDotsNear({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, 0.5)).toEqual([]);
    expect(gridDotsNear({ x: 0, y: 0 }, { x: 0, y: 0 }, 0, 1)).toEqual([]);
  });

  it('shows a few cells around the pointer when the cells are large', () => {
    const dots = gridDotsNear({ x: 128, y: 128 }, { x: 0, y: 0 }, 256, 1);
    expect(dots.find((d) => d.nearest)?.point).toEqual({ x: 256, y: 256 });
    expect(dots.length).toBeGreaterThanOrEqual(4);
  });
});
