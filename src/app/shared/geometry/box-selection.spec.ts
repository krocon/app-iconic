import { combineSelection, intersects, marqueeRect, selectModeOf } from './box-selection';

const same = (a: string, b: string) => a === b;

describe('box selection (design 007 E4)', () => {
  it('spans a rectangle in any direction', () => {
    expect(marqueeRect({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 30,
    });
  });

  it('intersects overlapping and touching rects (a line of width 0 too)', () => {
    const m = { x: 0, y: 0, width: 10, height: 10 };
    expect(intersects(m, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(intersects(m, { x: 10, y: 0, width: 0, height: 5 })).toBe(true);
    expect(intersects(m, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });

  it('replaces, adds and toggles', () => {
    expect(combineSelection(['a', 'b'], ['c', 'c'], 'replace', same)).toEqual(['c']);
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'add', same)).toEqual(['a', 'b', 'c']);
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'toggle', same)).toEqual(['a', 'c']);
  });

  it('⇧ adds, ⌘ (macOS) / Ctrl toggles', () => {
    const e = (shiftKey: boolean, metaKey: boolean, ctrlKey: boolean) => ({
      shiftKey,
      metaKey,
      ctrlKey,
    });
    expect(selectModeOf(e(true, false, false), true)).toBe('add');
    expect(selectModeOf(e(false, true, false), true)).toBe('toggle');
    expect(selectModeOf(e(false, false, true), true)).toBe('replace');
    expect(selectModeOf(e(false, false, true), false)).toBe('toggle');
    expect(selectModeOf(e(false, false, false), false)).toBe('replace');
  });
});
