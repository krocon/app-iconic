import { MAX_PATTERN_COPIES } from '../../shared/geometry/pattern';
import { patternValid } from './pattern-dialog';

describe('pattern dialog limits (prompt 064)', () => {
  const v = (count: number, columns = 2, rows = 1) => ({ count, angle: 360, columns, rows });

  it('the circular count goes up to the stepper maximum (original included)', () => {
    expect(patternValid('circular', v(MAX_PATTERN_COPIES + 1))).toBe(true);
    expect(patternValid('circular', v(MAX_PATTERN_COPIES + 2))).toBe(false);
    expect(patternValid('circular', v(1))).toBe(false);
    expect(patternValid('circular', { ...v(4), angle: 0 })).toBe(false);
  });

  it('columns × rows the same way', () => {
    expect(patternValid('rectangular', v(0, MAX_PATTERN_COPIES + 1, 1))).toBe(true);
    expect(patternValid('rectangular', v(0, MAX_PATTERN_COPIES + 2, 1))).toBe(false);
    expect(patternValid('rectangular', v(0, 1, 1))).toBe(false);
  });
});
