import { loadPaper, PaperScope } from './boolean-ops';
import { offsetPath, strokeArea } from './offset';

const circle = (r: number) => `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
const square = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';

describe('offset and outline stroke (prompt 052)', () => {
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
  const area = (d: string) => {
    const p = new scope.CompoundPath({ pathData: d, insert: false });
    p.reorient(true, true);
    return Math.abs(p.area);
  };

  it('a circle grows and shrinks by the distance, keeping curves', () => {
    const out = offsetPath(scope, circle(100), 10);
    expect(area(out) / (Math.PI * 110 * 110)).toBeCloseTo(1, 3);
    expect(out).toMatch(/c/i);
    expect(area(offsetPath(scope, circle(100), -10)) / (Math.PI * 90 * 90)).toBeCloseTo(1, 3);
  });

  it('a square: miter keeps sharp corners, round rounds them, inset shrinks', () => {
    expect(area(offsetPath(scope, square, 10, 'miter'))).toBeCloseTo(120 * 120, -1);
    expect(offsetPath(scope, square, 10, 'miter')).not.toMatch(/0\.00\d/);
    expect(area(offsetPath(scope, square, 10, 'round'))).toBeCloseTo(
      10000 + 4000 + Math.PI * 100,
      -1,
    );
    expect(area(offsetPath(scope, square, 10, 'bevel'))).toBeCloseTo(14400 - 4 * 50, -1);
    expect(area(offsetPath(scope, square, -10, 'miter'))).toBeCloseTo(80 * 80, 0);
  });

  it('an open line becomes a band; outline stroke with caps', () => {
    expect(area(offsetPath(scope, 'M 0 0 L 100 0', 10))).toBeCloseTo(2000, 0);
    const round = strokeArea(scope, 'M 0 0 L 100 0', {
      width: 20,
      join: 'round',
      cap: 'round',
      miterLimit: 4,
    });
    expect(area(round)).toBeCloseTo(2000 + Math.PI * 100, -1);
    const sq = strokeArea(scope, 'M 0 0 L 100 0', {
      width: 20,
      join: 'miter',
      cap: 'square',
      miterLimit: 4,
    });
    expect(area(sq)).toBeCloseTo(2400, 0);
    const curve = strokeArea(scope, 'M 0 0 C 50 -80 100 80 150 0', {
      width: 8,
      join: 'round',
      cap: 'butt',
      miterLimit: 4,
    });
    const len = new scope.Path({ pathData: 'M 0 0 C 50 -80 100 80 150 0', insert: false }).length;
    expect(area(curve) / (8 * len)).toBeCloseTo(1, 1);
  });

  it('an outlined ring of a circle stroke has a hole', () => {
    const ring = strokeArea(scope, circle(50), {
      width: 10,
      join: 'miter',
      cap: 'butt',
      miterLimit: 4,
    });
    expect(area(ring)).toBeCloseTo(Math.PI * (55 * 55 - 45 * 45), -1);
  });
});
