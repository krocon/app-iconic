import { translatePath } from './path-translate';

describe('translatePath', () => {
  it('moves absolute points and keeps relative offsets', () => {
    expect(translatePath('M0 0L10 0Q15 5 20 0Z', 5, -2)).toBe('M5 -2 L15 -2 Q20 3 25 -2 Z');
    expect(translatePath('M1 1l2 2h3', 1, 1)).toBe('M2 2 l2 2 h3');
    expect(translatePath('M0 0A5 5 0 0 1 10 0', 1, 0)).toBe('M1 0 A5 5 0 0 1 11 0');
  });

  it('rounds to the precision and refuses what it cannot read', () => {
    expect(translatePath('M0 0', 0.123456, 0)).toBe('M0.12 0');
    expect(translatePath('nonsense', 1, 1)).toBeNull();
  });
});
