import { describe, expect, it } from 'vitest';
import { DEFAULT_TINT, LUMA, parseTint, tintedMatrix, tintFilter } from './tinted';

/** Applies the 4×5 matrix to an RGBA colour (0…1). */
function apply(values: string, rgba: number[]): number[] {
  const m = values.split(' ').map(Number);
  return [0, 1, 2, 3].map(
    (r) =>
      m[r * 5] * rgba[0] +
      m[r * 5 + 1] * rgba[1] +
      m[r * 5 + 2] * rgba[2] +
      m[r * 5 + 3] * rgba[3] +
      m[r * 5 + 4],
  );
}

describe('tinted approximation (prompt 077 E2)', () => {
  it('maps luminance to the tint, alpha unchanged', () => {
    const m = tintedMatrix('#ff8000');
    expect(m.split(' ')).toHaveLength(20);
    const white = apply(m, [1, 1, 1, 0.5]);
    expect(white[0]).toBeCloseTo(1, 4);
    expect(white[1]).toBeCloseTo(128 / 255, 4);
    expect(white[2]).toBeCloseTo(0, 4);
    expect(white[3]).toBe(0.5);
    expect(apply(m, [0, 0, 0, 1]).slice(0, 3)).toEqual([0, 0, 0]);
    const green = apply(m, [0, 1, 0, 1]);
    expect(green[0]).toBeCloseTo(LUMA[1], 4);
    expect(green[1]).toBeCloseTo(LUMA[1] * (128 / 255), 4);
  });

  it('white tint = grey luminance; the weights add up to 1', () => {
    const m = tintedMatrix(DEFAULT_TINT);
    const c = apply(m, [0.2, 0.4, 0.6, 1]);
    const l = 0.2 * LUMA[0] + 0.4 * LUMA[1] + 0.6 * LUMA[2];
    expect(c[0]).toBeCloseTo(l, 4);
    expect(c[1]).toBeCloseTo(l, 4);
    expect(c[2]).toBeCloseTo(l, 4);
    expect(LUMA[0] + LUMA[1] + LUMA[2]).toBeCloseTo(1, 6);
  });

  it('parses tints', () => {
    expect(parseTint('#FF8000')).toBe('#ff8000');
    expect(parseTint(' #abc ')).toBe('#aabbcc');
    expect(parseTint('red')).toBeNull();
    expect(parseTint(3)).toBeNull();
    // an invalid tint counts as the default
    expect(tintedMatrix('nope')).toBe(tintedMatrix(DEFAULT_TINT));
  });

  it('builds the filter in canvas units or on the box', () => {
    const f = tintFilter(document, 't', '#000000');
    expect(f.getAttribute('filterUnits')).toBe('userSpaceOnUse');
    expect(f.getAttribute('width')).toBe('1024');
    expect(f.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(f.firstElementChild?.getAttribute('values')).toBe(tintedMatrix('#000000'));
    expect(tintFilter(document, 'b', '#000000', true).getAttribute('filterUnits')).toBeNull();
  });
});
