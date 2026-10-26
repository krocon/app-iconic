import { MIN_MAJOR_PX, rulerStep, rulerTicks } from './ruler-ticks';

describe('ruler-ticks', () => {
  it.each([
    [0.25, 200, 50],
    [0.33, 200, 50],
    [0.5, 100, 20],
    [0.66, 100, 20],
    [0.75, 100, 20],
    [1, 50, 10],
    [1.25, 50, 10],
    [1.5, 50, 10],
    [2, 50, 10],
    [4, 20, 5],
    [10, 5, 1],
  ])('zoom %s → major %s, minor %s (1-2-5 series)', (zoom, major, minor) => {
    expect(rulerStep(zoom)).toEqual({ major, minor });
    expect(major * zoom).toBeGreaterThanOrEqual(MIN_MAJOR_PX);
  });

  it('labels in document units, positions in viewport pixels', () => {
    const ticks = rulerTicks(1, 100, 300);
    const majors = ticks.filter((t) => t.major);
    expect(majors.map((t) => t.value)).toEqual([-100, -50, 0, 50, 100, 150, 200]);
    expect(majors.find((t) => t.value === 0)!.pos).toBe(100);
    expect(ticks[0].pos).toBeGreaterThanOrEqual(0);
    expect(ticks.at(-1)!.pos).toBeLessThanOrEqual(300);
    expect(ticks).toHaveLength(31); // -100 … 200 every 10
  });

  it('follows zoom and pan', () => {
    const ticks = rulerTicks(0.5, -37, 400).filter((t) => t.major);
    expect(ticks.map((t) => t.value)).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
    expect(ticks[0].pos).toBeCloseTo(100 * 0.5 - 37, 9);
  });

  it('gives round minor values', () => {
    const minors = rulerTicks(4, 0, 100).map((t) => t.value);
    expect(minors).toEqual([0, 5, 10, 15, 20, 25]);
  });
});
