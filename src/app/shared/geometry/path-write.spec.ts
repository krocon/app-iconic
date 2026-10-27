import { describe, expect, it } from 'vitest';
import { parsePath } from './path-data';
import { countPoints, formatNumber, writeKeepingForm, writeShortest } from './path-write';

const segs = (d: string) => parsePath(d)!;

describe('formatNumber', () => {
  it('rounds, drops trailing zeros, -0 and tiny values become 0', () => {
    expect(formatNumber(1.23456, 3)).toBe('1.235');
    expect(formatNumber(2.5, 0)).toBe('3');
    expect(formatNumber(1.1, 3)).toBe('1.1');
    expect(formatNumber(-0.0001, 3)).toBe('0');
    expect(formatNumber(1e-7, 3)).toBe('0');
    expect(formatNumber(-12.3456, 2)).toBe('-12.35');
  });
});

describe('writeKeepingForm', () => {
  it('keeps commands, relative / absolute form and implicit repetition', () => {
    expect(writeKeepingForm(segs('m1.11 1 l2 2 3 3 H10.55 v-2.22 z'), 1)).toBe(
      'm1.1 1 l2 2 3 3 H10.6 v-2.2 z',
    );
  });

  it('keeps S / T (the implied control follows the rounded neighbour)', () => {
    expect(writeKeepingForm(segs('M0 0 C0 10 10 10 10 0 S20 -10 20 0'), 0)).toBe(
      'M0 0 C0 10 10 10 10 0 S20 -10 20 0',
    );
    expect(writeKeepingForm(segs('M0 0 C0 10 10 10.4 10.4 0 S20 -10 20 0'), 0)).toBe(
      'M0 0 C0 10 10 10 10 0 S20 -10 20 0',
    );
  });
});

describe('writeShortest', () => {
  it('picks H / V and the shorter of relative and absolute', () => {
    expect(writeShortest(segs('M500 500 L600 500 L600 520 L601 521'), 3)).toBe(
      'M500 500H600v20l1 1',
    );
  });

  it('leaves out repeated letters, no separator before a minus', () => {
    expect(writeShortest(segs('M0 0 L5 7 L9 3 L2 -4'), 3)).toBe('M0 0L5 7 9 3 2-4');
  });
});

describe('countPoints', () => {
  it('counts every anchor except Z', () => {
    expect(countPoints(segs('M0 0 L1 1 C2 2 3 3 4 4 Z M5 5 L6 6'))).toBe(5);
  });
});
