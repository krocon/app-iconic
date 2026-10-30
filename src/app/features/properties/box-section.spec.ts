import { boxEditFromArgs } from './box-actions';
import { boxNumber, nextAnchor } from './box-section';

describe('box head helpers (prompt 062)', () => {
  it('numbers: two decimals, no -0', () => {
    expect(boxNumber(299.999)).toBe('300');
    expect(boxNumber(12.345)).toBe('12.35');
    expect(boxNumber(-0.001)).toBe('0');
  });

  it('the reference point moves with the arrow keys and wraps', () => {
    expect(nextAnchor('tl', 'ArrowRight')).toBe('t');
    expect(nextAnchor('tl', 'ArrowDown')).toBe('l');
    expect(nextAnchor('tl', 'ArrowLeft')).toBe('br');
    expect(nextAnchor('c', 'Enter')).toBeNull();
  });

  it('the AI arguments: numbers and flips only', () => {
    expect(boxEditFromArgs({ x: 1, width: 'a', flipH: true, flipV: 1, rotateBy: 5 })).toEqual({
      x: 1,
      rotateBy: 5,
      flipH: true,
    });
    expect(JSON.parse(JSON.stringify(boxEditFromArgs({ y: 2 })))).toEqual({ y: 2 });
  });
});
