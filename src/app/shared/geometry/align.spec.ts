import { alignDeltas, fmt, localDelta, unionRect } from './align';

const rects = [
  { x: 10, y: 20, width: 10, height: 10 },
  { x: 40, y: 0, width: 20, height: 40 },
];

describe('align (design 006 E13)', () => {
  it('unites the bounds', () => {
    expect(unionRect(rects)).toEqual({ x: 10, y: 0, width: 50, height: 40 });
  });

  it.each([
    ['left', [0, -30], [0, 0]],
    ['right', [40, 0], [0, 0]],
    ['centerH', [20, -15], [0, 0]],
  ] as const)('%s moves along x', (mode, xs, ys) => {
    const d = alignDeltas(rects, mode);
    expect(d.map((p) => p.x)).toEqual(xs);
    expect(d.map((p) => p.y)).toEqual(ys);
  });

  it.each([
    ['top', [-20, 0]],
    ['bottom', [10, 0]],
    ['middle', [-5, 0]],
  ] as const)('%s moves along y', (mode, ys) => {
    expect(alignDeltas(rects, mode).map((p) => p.y)).toEqual(ys);
    expect(alignDeltas(rects, mode).map((p) => p.x)).toEqual([0, 0]);
  });

  it('turns a document move into the parent system (inverse of its linear part)', () => {
    // parent scaled 2× in x and 0.5× in y: 10 document units = 5 / 20 local units
    expect(localDelta({ a: 2, b: 0, c: 0, d: 0.5 }, { x: 10, y: 10 })).toEqual({ x: 5, y: 20 });
    // rotated 90°: document +x is local −y
    const r = localDelta({ a: 0, b: 1, c: -1, d: 0 }, { x: 10, y: 0 })!;
    expect([r.x, r.y].map((v) => Math.round(v))).toEqual([0, -10]);
    expect(localDelta({ a: 0, b: 0, c: 0, d: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('formats numbers for attributes', () => {
    expect([fmt(1.234567), fmt(-0.00001), fmt(10)]).toEqual(['1.2346', '0', '10']);
  });
});
