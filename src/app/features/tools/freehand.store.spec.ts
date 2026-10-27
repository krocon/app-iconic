import { TestBed } from '@angular/core/testing';
import { FreehandStore } from './freehand.store';

describe('FreehandStore', () => {
  let s: FreehandStore;
  beforeEach(() => (s = TestBed.inject(FreehandStore)));

  it('draws only while active and samples by distance and time', () => {
    s.begin({ x: 0, y: 0 }, 0);
    expect(s.drawing()).toBe(false);
    s.toggle();
    s.begin({ x: 0, y: 0 }, 0);
    s.sample({ x: 1, y: 0 }, 20, 1); // too near
    s.sample({ x: 5, y: 0 }, 21, 1);
    s.sample({ x: 10, y: 0 }, 22, 1); // too soon
    s.sample({ x: 10, y: 0 }, 40, 1);
    expect(s.points()).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('finish gives the stroke (with the release point) and stays active', () => {
    s.toggle(true);
    s.begin({ x: 0, y: 0 }, 0);
    s.sample({ x: 10, y: 0 }, 20, 1);
    const stroke = s.finish({ x: 20, y: 0 }, 1)!;
    expect(stroke.points.length).toBe(3);
    expect(stroke.closed).toBe(false);
    expect(s.active()).toBe(true);
    expect(s.drawing()).toBe(false);
    expect(s.points()).toEqual([]);
  });

  it('a click is no stroke', () => {
    s.toggle(true);
    s.begin({ x: 0, y: 0 }, 0);
    expect(s.finish({ x: 0.1, y: 0 }, 1)).toBeNull();
  });

  it('closes when asked or when the end is near the start', () => {
    s.toggle(true);
    s.closed.set(true);
    s.begin({ x: 0, y: 0 }, 0);
    expect(s.finish({ x: 30, y: 0 }, 1)!.closed).toBe(true);
    s.closed.set(false);
    s.begin({ x: 0, y: 0 }, 0);
    for (const [i, [x, y]] of [
      [100, 0],
      [100, 100],
      [0, 100],
    ].entries()) {
      s.sample({ x, y }, 20 * (i + 1), 1);
    }
    expect(s.finish({ x: 3, y: 3 }, 1)!.closed).toBe(true);
  });

  it('Esc drops the stroke first, then ends the tool', () => {
    s.toggle(true);
    s.begin({ x: 0, y: 0 }, 0);
    expect(s.escape()).toBe(true);
    expect(s.active()).toBe(true);
    expect(s.escape()).toBe(true);
    expect(s.active()).toBe(false);
    expect(s.escape()).toBe(false);
  });

  it('toggling off drops a running stroke', () => {
    s.toggle(true);
    s.begin({ x: 0, y: 0 }, 0);
    s.toggle();
    expect(s.drawing()).toBe(false);
    expect(s.active()).toBe(false);
  });
});
