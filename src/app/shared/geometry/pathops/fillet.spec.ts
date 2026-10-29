import { fromSubpaths, toSubpaths } from '../pen/path-model';
import { loadPaper, PaperScope } from './boolean-ops';
import { filletCorner, FilletResult } from './fillet';

describe('fillet and chamfer (prompt 051)', () => {
  let scope: PaperScope;
  beforeAll(async () => {
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) =>
        k in t ? t[k] : k === 'getImageData' ? () => ({ data: [0, 0, 0, 0] }) : () => undefined,
      set: (t, k, v) => ((t[k] = v), true),
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    scope = await loadPaper();
  });
  const norm = (d: string) => fromSubpaths(toSubpaths(d)!);
  const near = (a: { x: number; y: number }, x: number, y: number) => {
    expect(a.x).toBeCloseTo(x, 3);
    expect(a.y).toBeCloseTo(y, 3);
  };

  it('two crossing lines: tangent points at r from the corner, the first gets the arc', () => {
    const r = filletCorner(
      scope,
      { d: 'M 0 0 L 100 0', p: { x: 10, y: 0 } },
      { d: 'M 80 -50 L 80 50', p: { x: 80, y: 40 } },
      20,
      'fillet',
      3,
    ) as FilletResult;
    near(r.ta, 60, 0);
    near(r.tb, 80, 20);
    near(r.center!, 60, 20);
    expect(norm(r.a)).toMatch(/^M 0 0 L 60 0 C .* 80 20$/);
    expect(norm(r.b!)).toBe('M 80 20 L 80 50');
  });

  it('works in every quadrant and with lines meeting at their ends', () => {
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const r = filletCorner(
        scope,
        { d: `M 0 0 L ${100 * sx} 0`, p: { x: 50 * sx, y: 0 } },
        { d: `M 0 0 L 0 ${100 * sy}`, p: { x: 0, y: 50 * sy } },
        10,
        'fillet',
        3,
      ) as FilletResult;
      near(r.center!, 10 * sx, 10 * sy);
    }
  });

  it('a line and a circle: the circle stays tangent, the centre is r from both', () => {
    const circle = 'M 50 0 A 50 50 0 1 1 -50 0 A 50 50 0 1 1 50 0 Z';
    const r = filletCorner(
      scope,
      { d: 'M -100 30 L 100 30', p: { x: 90, y: 30 } },
      { d: circle, p: { x: 0, y: -50 } },
      10,
      'fillet',
      3,
    ) as FilletResult;
    const c = r.center!;
    expect(Math.abs(c.y - 30)).toBeCloseTo(10, 2);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(60, 2);
  });

  it('a corner of one path, also next to a curved side; chamfer cuts r along each side', () => {
    const r = filletCorner(
      scope,
      { d: 'M 0 0 L 100 0 L 100 100', p: { x: 99, y: 1 } },
      null,
      20,
      'fillet',
      3,
    ) as FilletResult;
    expect(norm(r.a)).toMatch(/^M 0 0 L 80 0 C .* 100 20 L 100 100$/);
    const curved = filletCorner(
      scope,
      { d: 'M 0 0 L 100 0 C 100 50 150 100 200 100', p: { x: 100, y: 1 } },
      null,
      15,
      'fillet',
      3,
    ) as FilletResult;
    expect(curved.center).not.toBeNull();
    const ch = filletCorner(
      scope,
      { d: 'M 0 0 L 100 0 L 100 100 Z', p: { x: 99, y: 1 } },
      null,
      10,
      'chamfer',
      3,
    ) as FilletResult;
    expect(norm(ch.a)).toContain('L 90 0 L 100 10');
  });

  it('too large or no corner', () => {
    expect(
      filletCorner(scope, { d: 'M 0 0 L 10 0 L 10 10', p: { x: 9, y: 0 } }, null, 50, 'fillet', 3),
    ).toBe('tooLarge');
    expect(
      filletCorner(
        scope,
        { d: 'M 0 0 L 10 0', p: { x: 5, y: 0 } },
        { d: 'M 0 10 L 10 10', p: { x: 5, y: 10 } },
        5,
        'fillet',
        3,
      ),
    ).toBe('noCorner');
  });
});
