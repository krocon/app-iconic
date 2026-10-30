import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORIENTATION,
  isValidFill,
  NEW_FILL_KINDS,
  RADIAL_CREATABLE,
  readFill,
  switchKind,
  withColor,
  withOrientation,
  writeFill,
} from './fill-model';

const P3 = 'display-p3:0.30980,0.03922,0.96078,1.00000';
const P3B = 'display-p3:0.15686,0.01176,0.49020,1.00000';

/** Every fill of the evidence files (design 010) – and some we do not know. */
const FILLS: unknown[] = [
  'automatic',
  'system-light',
  'system-dark',
  'none',
  { solid: 'extended-gray:0.50000,1.00000' },
  { 'automatic-gradient': 'display-p3:0.54510,0.36863,0.21176,1.00000' },
  { 'linear-gradient': [P3, P3B] },
  {
    'linear-gradient': [P3, P3B],
    orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } },
  },
  {
    orientation: { stop: { x: -0.05, y: 0.36 }, start: { x: 0.62, y: 0.75 } },
    'linear-gradient': [P3, P3B],
  },
  { 'radial-gradient': [P3, P3B] },
];
const UNKNOWN: unknown[] = [
  'sparkles',
  42,
  null,
  [P3],
  { solid: 'cmyk:1,2,3,4' },
  { solid: P3, 'x-future': 1 },
  { 'linear-gradient': [P3, P3B], orientation: { start: { x: 0 } } },
  { 'conic-gradient': [P3] },
];

describe('fill model (design 010 E6)', () => {
  it('every kind: read → write gives the same value byte for byte', () => {
    for (const f of FILLS) {
      const m = readFill(f);
      expect(m.kind).not.toBe('unknown');
      expect(JSON.stringify(writeFill(m))).toBe(JSON.stringify(f));
    }
  });

  it('unknown shapes stay as they are', () => {
    for (const f of UNKNOWN) {
      const m = readFill(f);
      expect(m.kind).toBe('unknown');
      expect(writeFill(m)).toBe(f);
      expect(isValidFill(f)).toBe(false);
    }
  });

  it('a changed colour keeps the key order and the orientation of the file', () => {
    const f = FILLS[8] as Record<string, unknown>;
    const out = writeFill(withColor(readFill(f), 1, 'srgb:0.00000,0.00000,0.00000,1.00000'));
    expect(Object.keys(out as object)).toEqual(['orientation', 'linear-gradient']);
    expect(out).toEqual({ ...f, 'linear-gradient': [P3, 'srgb:0.00000,0.00000,0.00000,1.00000'] });
  });

  it('orientation: changed, or added with the default', () => {
    const m = withOrientation(readFill(FILLS[6]), 'stop', 'y', 1);
    expect(writeFill(m)).toEqual({
      'linear-gradient': [P3, P3B],
      orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
    });
  });

  it('switching kinds carries the colours over', () => {
    const solid = switchKind(readFill('automatic'), 'solid');
    expect(writeFill(solid)).toEqual({ solid: 'display-p3:0.00000,0.53333,1.00000,1.00000' });
    const linear = switchKind(readFill({ solid: P3 }), 'linear-gradient');
    expect(writeFill(linear)).toEqual({
      'linear-gradient': [P3, 'display-p3:0.16980,0.00000,0.82078,1.00000'],
      orientation: DEFAULT_ORIENTATION,
    });
    expect(writeFill(switchKind(linear, 'automatic-gradient'))).toEqual({
      'automatic-gradient': P3,
    });
    expect(writeFill(switchKind(linear, 'system-dark'))).toBe('system-dark');
    expect(isValidFill({ 'radial-gradient': [P3] })).toBe(true);
  });
});

describe('radial gradient (prompt 077 E5)', () => {
  it('is created by the model from a linear gradient or a colour', () => {
    const linear = readFill({ 'linear-gradient': [P3, P3B] });
    expect(writeFill(switchKind(linear, 'radial-gradient'))).toEqual({
      'radial-gradient': [P3, P3B],
      orientation: DEFAULT_ORIENTATION,
    });
    const solid = readFill({ solid: P3 });
    const r = writeFill(switchKind(solid, 'radial-gradient')) as Record<string, unknown>;
    expect((r['radial-gradient'] as string[])[0]).toBe(P3);
    expect(r['orientation']).toEqual(DEFAULT_ORIENTATION);
    // read back as a radial gradient
    expect(readFill(r).kind).toBe('radial-gradient');
  });

  it('is read, edited in place, and keeps the key order of the file', () => {
    const file = {
      orientation: { start: { x: 0.5, y: 0.5 }, stop: { x: 0.5, y: 1 } },
      'radial-gradient': [P3, P3B],
    };
    const m = readFill(file);
    expect(m).toMatchObject({ kind: 'radial-gradient', colors: [P3, P3B] });
    expect(writeFill(m)).toBe(file);
    const changed = writeFill(withColor(m, 1, P3)) as Record<string, unknown>;
    expect(Object.keys(changed)).toEqual(['orientation', 'radial-gradient']);
    expect(changed['radial-gradient']).toEqual([P3, P3]);
    // unknown fields: the whole value stays as it is (read only, kept)
    const unknown = { 'radial-gradient': [P3], 'x-future': true };
    expect(readFill(unknown).kind).toBe('unknown');
    expect(writeFill(readFill(unknown))).toBe(unknown);
  });

  it('is not offered in the editor until an Icon Composer file shows it', () => {
    expect(RADIAL_CREATABLE).toBe(false);
    expect(NEW_FILL_KINDS).not.toContain('radial-gradient');
  });
});
