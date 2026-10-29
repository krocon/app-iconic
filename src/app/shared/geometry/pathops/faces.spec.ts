import { loadPaper, PaperScope } from './boolean-ops';
import { Arrangement, faceAt, insidePoint, unionOf } from './faces';

const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;

describe('faces of an arrangement (prompt 060)', () => {
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
  const area = (d: string | null) => {
    const p = new scope.CompoundPath({ pathData: d ?? '', insert: false });
    p.reorient(true, true);
    return Math.abs(p.area);
  };

  it('a triangle of three open lines that overshoot: the inside is a face', () => {
    const outlines = [line(-10, 0, 110, 0), line(0, -10, 0, 110), line(-10, 110, 110, -10)];
    // the hypotenuse x + y = 100 crosses the axes at (100,0) and (0,100)
    expect(area(faceAt(scope, outlines, { x: 20, y: 20 }))).toBeCloseTo(5000, 0);
    expect(faceAt(scope, outlines, { x: 80, y: 80 })).toBeNull();
  });

  it('two overlapping circles: lens and the two moons', () => {
    const outlines = [circle(0, 0, 10), circle(10, 0, 10)];
    const lens = area(faceAt(scope, outlines, { x: 5, y: 0 }));
    const moon = area(faceAt(scope, outlines, { x: -5, y: 0 }));
    // arcs become Béziers: a few tenths off the exact circle
    expect(lens + 2 * moon).toBeCloseTo(2 * Math.PI * 100 - lens, 0);
    expect(lens).toBeGreaterThan(50);
    expect(lens).toBeLessThan(150);
  });

  it('a circle cut by a line; an island inside a square is a hole', () => {
    const cut = [circle(0, 0, 10), line(-20, 0, 20, 0)];
    expect(area(faceAt(scope, cut, { x: 0, y: 5 }))).toBeCloseTo((Math.PI * 100) / 2, 0);
    const sq = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';
    const withIsland = [sq, circle(50, 50, 10)];
    expect(area(faceAt(scope, withIsland, { x: 10, y: 10 }))).toBeCloseTo(10000 - Math.PI * 100, 0);
    expect(area(faceAt(scope, withIsland, { x: 50, y: 50 }))).toBeCloseTo(Math.PI * 100, 0);
  });

  it('dangling lines do not make faces; faces unite; a seed lands inside', () => {
    const a = new Arrangement(scope, [line(0, 0, 10, 0), line(5, -5, 5, 5)]);
    expect(a.edges).toHaveLength(0);
    const outlines = ['M 0 0 L 100 0 L 100 100 L 0 100 Z', line(50, -10, 50, 110)];
    const l = faceAt(scope, outlines, { x: 25, y: 50 })!;
    const r = faceAt(scope, outlines, { x: 75, y: 50 })!;
    expect(area(l)).toBeCloseTo(5000, 0);
    expect(area(unionOf(scope, [l, r]))).toBeCloseTo(10000, 0);
    const q = insidePoint(scope, l)!;
    expect(q.x).toBeGreaterThan(0);
    expect(q.x).toBeLessThan(50);
  });
});
