import {
  cutAlong,
  cutByRect,
  divide,
  loadPaper,
  pathfinder,
  PaperScope,
  pieces,
  uniteAll,
} from './boolean-ops';

const rect = (x: number, y: number, w: number, h: number) =>
  `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

describe('boolean ops (prompt 047)', () => {
  let scope: PaperScope;
  beforeAll(async () => {
    // jsdom has no 2D canvas; paper.js only probes blend modes with it when it loads
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) =>
        k in t ? t[k] : k === 'getImageData' ? () => ({ data: [0, 0, 0, 0] }) : () => undefined,
      set: (t, k, v) => ((t[k] = v), true),
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    scope = await loadPaper();
  });
  const areaOf = (d: string) => {
    const p = new scope.CompoundPath({ pathData: d, insert: false });
    p.reorient(true, true);
    return Math.abs(p.area);
  };

  it('unite / minus front / intersect / exclude two overlapping squares', () => {
    const shapes = [{ d: rect(0, 0, 10, 10) }, { d: rect(5, 0, 10, 10) }];
    expect(areaOf(pathfinder(scope, 'unite', shapes))).toBeCloseTo(150);
    expect(areaOf(pathfinder(scope, 'minusFront', shapes))).toBeCloseTo(50);
    expect(areaOf(pathfinder(scope, 'intersect', shapes))).toBeCloseTo(50);
    const x = pathfinder(scope, 'exclude', shapes);
    expect(areaOf(x)).toBeCloseTo(100);
    expect(pathfinder(scope, 'intersect', [{ d: rect(0, 0, 1, 1) }, { d: rect(5, 5, 1, 1) }])).toBe(
      '',
    );
  });

  it('keeps curves: two circles unite to cubics, area of the lens right', () => {
    const shapes = [{ d: circle(0, 0, 10) }, { d: circle(10, 0, 10) }];
    const u = pathfinder(scope, 'unite', shapes);
    expect(u).toMatch(/c/i);
    const lens = 2 * 100 * Math.acos(0.5) - 5 * Math.sqrt(400 - 100);
    expect(areaOf(pathfinder(scope, 'intersect', shapes))).toBeCloseTo(lens, 0);
    expect(areaOf(u)).toBeCloseTo(2 * Math.PI * 100 - lens, 0);
  });

  it('a hole: minus front of a small square in a big one leaves a ring', () => {
    const d = pathfinder(scope, 'minusFront', [{ d: rect(0, 0, 10, 10) }, { d: rect(3, 3, 4, 4) }]);
    expect(areaOf(d)).toBeCloseTo(84);
    expect(pieces(scope, d)).toHaveLength(1);
  });

  it('divide makes three faces of two overlapping squares, the front one owns the overlap', () => {
    const r = divide(scope, [{ d: rect(0, 0, 10, 10) }, { d: rect(5, 0, 10, 10) }]);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.source).sort()).toEqual([0, 1, 1]);
    expect(r.map((x) => areaOf(x.d)).sort((a, b) => a - b)).toEqual([
      expect.closeTo(50),
      expect.closeTo(50),
      expect.closeTo(50),
    ]);
    expect(
      areaOf(
        uniteAll(
          scope,
          r.map((x) => x.d),
        ),
      ),
    ).toBeCloseTo(150);
  });

  it('cuts: a line through a square gives two pieces, a rectangle inside and outside', () => {
    const two = cutAlong(
      scope,
      rect(0, 0, 10, 10),
      [
        { x: 5, y: -5 },
        { x: 5, y: 15 },
      ],
      0.01,
    );
    expect(two).toHaveLength(2);
    expect(
      cutAlong(
        scope,
        rect(0, 0, 10, 10),
        [
          { x: 20, y: -5 },
          { x: 20, y: 15 },
        ],
        0.01,
      ),
    ).toHaveLength(1);
    const inOut = cutByRect(scope, rect(0, 0, 10, 10), { x: 5, y: 5, width: 10, height: 10 });
    expect(inOut.map(areaOf).sort((a, b) => a - b)).toEqual([
      expect.closeTo(25),
      expect.closeTo(75),
    ]);
  });
});
