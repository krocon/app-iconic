import {
  angleDimension,
  arcPath,
  formatValue,
  linearDimension,
  measure,
  radialDimension,
} from './dimension';

describe('measure and dimension (prompt 048)', () => {
  it('measures distance, angle (counter-clockwise on screen) and dx/dy', () => {
    expect(measure({ x: 0, y: 0 }, { x: 30, y: -40 })).toEqual({
      distance: 50,
      angle: expect.closeTo(53.13, 2),
      dx: 30,
      dy: -40,
    });
    expect(measure({ x: 0, y: 0 }, { x: -10, y: 0 }).angle).toBe(180);
    expect(measure({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({
      distance: 0,
      angle: 0,
      dx: 0,
      dy: 0,
    });
  });

  it('formats values with one decimal, without -0', () => {
    expect(formatValue(12)).toBe('12');
    expect(formatValue(12.345)).toBe('12.3');
    expect(formatValue(-0.01)).toBe('0');
  });

  it('linear: a parallel dimension line through the placing point, label upright', () => {
    const d = linearDimension({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: -20 })!;
    expect(d.value).toBe(100);
    expect(d.text).toBe('100');
    expect(d.lines[2]).toEqual([
      { x: 0, y: -20 },
      { x: 100, y: -20 },
    ]);
    expect(d.label).toEqual({ x: 50, y: -20 });
    expect(d.rotate).toBeCloseTo(0);
    // right to left reads the same way
    expect(linearDimension({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })!.rotate).toBeCloseTo(
      0,
    );
    expect(linearDimension({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('radial: radius from the centre to the edge, diameter across, label outside follows', () => {
    const r = radialDimension({ x: 0, y: 0 }, 50, { x: 10, y: 0 }, false)!;
    expect(r.text).toBe('R50');
    expect(r.lines[0]).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
    const d = radialDimension({ x: 0, y: 0 }, 50, { x: 0, y: 80 }, true)!;
    expect(d.text).toBe('⌀100');
    expect(d.lines[0][0].y).toBeCloseTo(-50);
    expect(d.lines[0][1]).toEqual({ x: 0, y: 80 });
    expect(d.label).toEqual({ x: 0, y: 80 });
  });

  it('angle: the smaller angle between the rays, arc at the placing distance', () => {
    const a = angleDimension({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -10 }, { x: 30, y: -30 })!;
    expect(a.value).toBeCloseTo(90);
    expect(a.text).toBe('90°');
    expect(a.arc!.r).toBeCloseTo(Math.hypot(30, 30));
    expect(arcPath(a.arc!)).toMatch(/^M 42\.4\d* 0 A/);
    const b = angleDimension({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 1 }, { x: 5, y: 5 })!;
    expect(b.value).toBeCloseTo(180 - (Math.atan2(1, 10) * 180) / Math.PI);
  });
});
