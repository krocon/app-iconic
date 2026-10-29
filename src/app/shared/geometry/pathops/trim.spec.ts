import { loadPaper, PaperScope } from './boolean-ops';
import { extendAt, trimAt } from './trim';
import { fromSubpaths, toSubpaths } from '../pen/path-model';

const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

describe('trim and extend (prompt 050)', () => {
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
  const pts = (d: string) =>
    [...fromSubpaths(toSubpaths(d)!).matchAll(/-?\d+(\.\d+)?/g)].map(
      (m) => Math.round(Number(m[0]) * 100) / 100,
    );

  it('cuts the end of a line beyond a crossing', () => {
    const r = trimAt(scope, 'M 0 0 L 100 0', ['M 60 -50 L 60 50'], { x: 80, y: 1 }, 3)!;
    expect(pts(r.keep)).toEqual([0, 0, 60, 0]);
    expect(pts(r.piece)).toEqual([60, 0, 100, 0]);
  });

  it('cuts the middle of a line between two crossings: two pieces stay', () => {
    const r = trimAt(
      scope,
      'M 0 0 L 100 0',
      ['M 30 -50 L 30 50', 'M 70 -50 L 70 50'],
      { x: 50, y: 0 },
      3,
    )!;
    expect(r.keep.match(/M/gi)).toHaveLength(2);
    expect(pts(r.piece)).toEqual([30, 0, 70, 0]);
  });

  it('a line without crossings goes completely; nothing near: null', () => {
    expect(trimAt(scope, 'M 0 0 L 100 0', [], { x: 50, y: 0 }, 3)!.keep).toBe('');
    expect(trimAt(scope, 'M 0 0 L 100 0', [], { x: 50, y: 40 }, 3)).toBeNull();
  });

  it('a circle cut by a line becomes the arc on the other side', () => {
    const r = trimAt(scope, circle(0, 0, 50), ['M -100 30 L 100 30'], { x: 0, y: 50 }, 3)!;
    const p = new scope.Path({ pathData: r.keep, insert: false });
    expect(p.closed).toBe(false);
    expect(p.firstSegment.point.y).toBeCloseTo(30);
    expect(p.lastSegment.point.y).toBeCloseTo(30);
    expect(p.getNearestLocation(new scope.Point(0, -50)).distance).toBeLessThan(0.01);
    expect(p.getNearestLocation(new scope.Point(0, 50)).distance).toBeGreaterThan(10);
  });

  it('extends a line to a circle and to a line, keeping it one segment', () => {
    const r = extendAt(scope, 'M 0 0 L 10 0', [circle(100, 0, 30)], { x: 10, y: 0 }, 3)!;
    expect(pts(r.keep)).toEqual([0, 0, 70, 0]);
    const s = extendAt(scope, 'M 0 0 L 10 0', ['M 40 -10 L 40 10'], { x: 0, y: 0 }, 3);
    expect(s).toBeNull();
    const t = extendAt(scope, 'M 50 0 L 60 0', ['M 20 -10 L 20 10'], { x: 50, y: 0 }, 3)!;
    expect(pts(t.keep)).toEqual([20, 0, 60, 0]);
  });
});
