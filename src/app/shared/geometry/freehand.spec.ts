import {
  acceptSample,
  catmullRomToCubics,
  cubicsToPath,
  downsample,
  freehandPath,
  isNear,
  quantize,
  shouldAutoClose,
  simplify,
} from './freehand';

const P = (x: number, y: number) => ({ x, y });

describe('freehand pipeline (cases of FreeHandPathTests.swift)', () => {
  it('RDP keeps the end points', () => {
    const pts = [P(0, 0), P(5, 3), P(10, 0)];
    const s = simplify(pts, 4, false);
    expect(s).toEqual([P(0, 0), P(10, 0)]);
  });

  it('RDP of a closed stroke ends on its start', () => {
    const pts = [P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)];
    const s = simplify(pts, 0.1, true);
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(isNear(s[0], s[s.length - 1])).toBe(true);
  });

  it('RDP closes an open list when asked to', () => {
    const s = simplify([P(0, 0), P(10, 0), P(10, 10), P(0, 10)], 0.1, true);
    expect(s[s.length - 1]).toEqual(P(0, 0));
  });

  it('RDP keeps a corner above epsilon and drops noise below it', () => {
    const pts = [P(0, 0), P(50, 0.5), P(100, 0), P(100, 50), P(100, 100)];
    expect(simplify(pts, 2.5, false)).toEqual([P(0, 0), P(100, 0), P(100, 100)]);
  });

  it('Catmull-Rom gives one cubic per gap through the points, straight on a line', () => {
    const pts = [P(0, 0), P(20, 0), P(40, 0)];
    const c = catmullRomToCubics(pts, false, 0.5);
    expect(c.length).toBe(2);
    expect(c[0].p0).toEqual(pts[0]);
    expect(c[0].p1).toEqual(pts[1]);
    expect(c[1].p1).toEqual(pts[2]);
    for (const k of c) {
      expect(k.c1.y).toBeCloseTo(0, 4);
      expect(k.c2.y).toBeCloseTo(0, 4);
    }
  });

  it('a closed Catmull-Rom curve has one cubic per point and ends where it starts', () => {
    const c = catmullRomToCubics([P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)], true);
    expect(c.length).toBe(4);
    expect(c[3].p1).toEqual(P(0, 0));
  });

  it('the path builder quantises to one decimal', () => {
    const cubics = [{ p0: P(0, 0), c1: P(10.04, 20.06), c2: P(30, 40), p1: P(50.09, 60) }];
    expect(cubicsToPath(cubics, 1, false)).toBe('M 0 0 C 10 20.1 30 40 50.1 60');
    expect(quantize(20.06, 1)).toBe(20.1);
    expect(quantize(-0.04, 1)).toBe(-0);
    expect(
      cubicsToPath([{ p0: P(-0.01, 0), c1: P(0, 0), c2: P(0, 0), p1: P(1, 1) }], 1, false),
    ).toBe('M 0 0 C 0 0 0 0 1 1');
  });

  it('the path builder adds Z for a closed stroke', () => {
    const cubics = [{ p0: P(0, 0), c1: P(10, 0), c2: P(20, 10), p1: P(30, 0) }];
    expect(cubicsToPath(cubics, 0, true).endsWith('Z')).toBe(true);
    expect(cubicsToPath([], 1, true)).toBe('');
  });

  it('downsampling keeps the last point and the limit', () => {
    const pts = Array.from({ length: 10_000 }, (_, i) => P(i, 0));
    const d = downsample(pts, 4096);
    expect(d.length).toBeLessThanOrEqual(4097);
    expect(d[d.length - 1]).toEqual(P(9999, 0));
    expect(downsample(pts.slice(0, 10), 4096).length).toBe(10);
  });

  it('the whole pipeline: a wobbly line becomes few cubics, a click nothing', () => {
    const pts = Array.from({ length: 200 }, (_, i) => P(i, Math.sin(i / 10) * 0.5));
    const d = freehandPath(pts, { closed: false })!;
    expect(d.startsWith('M 0 0 C')).toBe(true);
    expect(d.split('C').length - 1).toBeLessThan(5);
    expect(freehandPath([P(1, 1)], { closed: false })).toBeNull();
    expect(freehandPath([P(1, 1), P(NaN, 2)], { closed: false })).toBeNull();
  });

  it('a closed stroke becomes a closed path', () => {
    const circle = Array.from({ length: 64 }, (_, i) =>
      P(100 + 50 * Math.cos((i / 64) * 2 * Math.PI), 100 + 50 * Math.sin((i / 64) * 2 * Math.PI)),
    );
    const d = freehandPath(circle, { closed: true, epsilon: 1 })!;
    expect(d.endsWith('Z')).toBe(true);
    expect(d.startsWith('M 150 100')).toBe(true);
  });

  it('samples need 3 screen pixels and 1/120 s', () => {
    const last = { p: P(0, 0), t: 0 };
    expect(acceptSample(null, P(0, 0), 0, 1)).toBe(true);
    expect(acceptSample(last, P(3, 0), 10, 1)).toBe(true);
    expect(acceptSample(last, P(2, 0), 100, 1)).toBe(false); // too near
    expect(acceptSample(last, P(10, 0), 5, 1)).toBe(false); // too soon
    // zoom 200 %: 1.5 document units are 3 screen pixels
    expect(acceptSample(last, P(1.5, 0), 10, 2)).toBe(true);
  });

  it('auto-closes a long stroke ending near its start (screen pixels)', () => {
    const loop = [P(0, 0), P(100, 0), P(100, 100), P(0, 100), P(5, 5)];
    expect(shouldAutoClose(loop, 1)).toBe(true);
    expect(shouldAutoClose(loop, 4)).toBe(false); // 5 units = 28 px at 400 %
    expect(shouldAutoClose([P(0, 0), P(10, 0), P(1, 1)], 1)).toBe(false); // too short
    expect(shouldAutoClose([P(0, 0), P(100, 0), P(200, 0)], 1)).toBe(false);
  });
});
