import { describe, expect, it } from 'vitest';
import { circlesWith, hasWatch, readSquares, SQUARES_CHOICES, squaresValue } from './platforms';

describe('supported platforms (design 010 E10)', () => {
  it('squares: every choice round-trips, unknown values stay "other"', () => {
    for (const c of SQUARES_CHOICES) expect(readSquares(squaresValue(c as never))).toBe(c);
    expect(readSquares(['macOS', 'iOS'])).toBe('iOS+macOS');
    expect(readSquares(['visionOS'])).toBe('other');
    expect(readSquares(['iOS', 'iOS'])).toBe('other');
    expect(readSquares(7)).toBe('other');
  });

  it('circles: watchOS on/off, other entries kept, empty → no key', () => {
    expect(hasWatch(['watchOS'])).toBe(true);
    expect(hasWatch('watchOS')).toBe(true);
    expect(circlesWith(undefined, true)).toEqual(['watchOS']);
    expect(circlesWith(['watchOS'], false)).toBeUndefined();
    expect(circlesWith(['x', 'watchOS'], false)).toEqual(['x']);
    expect(circlesWith(['x'], true)).toEqual(['x', 'watchOS']);
    const same = ['watchOS'];
    expect(circlesWith(same, true)).toBe(same);
    expect(circlesWith('watchOS', false)).toBeUndefined();
  });
});
