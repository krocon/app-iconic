import { cornersOf, cutCorners, maxRadius, radiusAt, widgetAt } from './corners';

describe('Live Corners (prompt 045)', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('the corners of a polygon; an open one has no ends; straight points are none', () => {
    expect(cornersOf(square, true)).toHaveLength(4);
    expect(cornersOf(square, false).map((c) => c.index)).toEqual([1, 2]);
    expect(
      cornersOf(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 50 },
        ],
        true,
      ).map((c) => c.index),
    ).toEqual([0, 2, 3]);
  });

  it('round: tangent points at r along the sides, quarter arcs; clamped to half a side', () => {
    const a = cutCorners(square, true, 10, 'round');
    expect(a).toHaveLength(8);
    expect(a[0].p.x).toBeCloseTo(0, 9);
    expect(a[0].p.y).toBeCloseTo(10, 9);
    expect(a[1].p.x).toBeCloseTo(10, 9);
    expect(a[1].p.y).toBeCloseTo(0, 9);
    // the handle of a quarter arc of radius 10 is 10 · κ long
    expect(Math.hypot(a[0].hout!.x - a[0].p.x, a[0].hout!.y - a[0].p.y)).toBeCloseTo(5.5228, 4);
    expect(maxRadius(cornersOf(square, true)[0])).toBeCloseTo(50, 9);
    const big = cutCorners(square, true, 500, 'chamfer');
    expect(big[1].p.x).toBeCloseTo(50, 9);
  });

  it('inverted round bulges inwards; chamfer is a straight cut', () => {
    const inv = cutCorners(square, true, 10, 'inverted');
    // the arc around (0,0) from (0,10) to (10,0): its handles lead away from the corner
    expect(inv[0].hout!.x).toBeGreaterThan(0);
    expect(inv[0].hout!.y).toBeCloseTo(10, 9);
    const ch = cutCorners(square, true, 10, 'chamfer');
    expect(ch.every((p) => !p.hin && !p.hout)).toBe(true);
  });

  it('the widget sits at the arc centre; dragging it along the bisector sets the radius', () => {
    const c = cornersOf(square, true)[0];
    const w = widgetAt(c, 10, 2);
    expect(w.x).toBeCloseTo(10, 9);
    expect(w.y).toBeCloseTo(10, 9);
    expect(radiusAt(c, { x: 20, y: 20 })).toBeCloseTo(20, 9);
    expect(radiusAt(c, { x: -5, y: -5 })).toBe(0);
    expect(radiusAt(c, { x: 90, y: 90 })).toBeCloseTo(50, 9);
  });
});
