import { clamp, formatStep, readNumber, stepText } from './step-value';

describe('stepped values (design 009 E10)', () => {
  it('reads numbers with and without units', () => {
    expect(readNumber('12.5', false)).toEqual({ n: 12.5, unit: '' });
    expect(readNumber('50%', false)).toBeNull();
    expect(readNumber('50%', true)).toEqual({ n: 50, unit: '%' });
    expect(readNumber('abc', true)).toBeNull();
  });

  it('steps ± step, ×10 by the caller, clamped and rounded', () => {
    expect(stepText('1', 1, { step: 1 }, false)).toBe('2');
    expect(stepText('0.5', 1, { min: 0, max: 1, step: 0.01 }, false)).toBe('0.51');
    expect(stepText('0.95', 10, { min: 0, max: 1, step: 0.01 }, false)).toBe('1');
    expect(stepText('0.05', -10, { min: 0, max: 1, step: 0.01 }, false)).toBe('0');
    expect(stepText('50%', 1, { step: 1 }, true)).toBe('51%');
    expect(stepText('', 1, { step: 1 }, false, 4)).toBe('5');
    expect(stepText('0.1', 2, { step: 0.1 }, false)).toBe('0.3');
    expect(clamp(5, { min: 6 })).toBe(6);
    expect(formatStep(1.23456, 0.001)).toBe('1.235');
    expect(formatStep(-0.0001, 0.01)).toBe('0');
  });
});
