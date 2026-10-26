import { CORNER_START, ICON_CORNER_RATIO, squirclePath } from './squircle';

/** All coordinate pairs of a path made of M/L/C/Z with absolute numbers. */
function points(d: string): [number, number][] {
  const nums = d
    .replace(/[MLCZ]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

describe('squircle', () => {
  const d = squirclePath(1024);

  it('is closed, starts on the top edge and stays inside the square', () => {
    const r = 1024 * ICON_CORNER_RATIO;
    expect(d.startsWith(`M ${Math.round(CORNER_START * r * 1000) / 1000} 0 `)).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1024);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1024);
    }
    expect((d.match(/C/g) ?? []).length).toBe(12);
    expect((d.match(/L/g) ?? []).length).toBe(4);
  });

  it('is symmetric (mirror x and y)', () => {
    const key = (p: [number, number]) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
    const set = new Set(points(d).map(key));
    for (const [x, y] of points(d)) {
      expect(set.has(key([1024 - x, y]))).toBe(true);
      expect(set.has(key([x, 1024 - y]))).toBe(true);
      expect(set.has(key([y, x]))).toBe(true);
    }
  });

  it('scales with the size and limits the radius', () => {
    expect(squirclePath(512)).toBe(squirclePath(512, 512 * ICON_CORNER_RATIO));
    const huge = points(squirclePath(100, 1000));
    expect(huge[0][0]).toBeCloseTo(50, 2);
  });
});
