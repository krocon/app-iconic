import { IDENTITY } from '../../shared/geometry/matrix';
import { arcCenter, arcTangentAt } from '../../shared/geometry/sketch/svg-arc';
import { formatValue, parseValue } from './sketch-overlay';
import { shapeSpec, similarity } from './sketch-elements';
import { nearestAnchor, nearestTarget, SketchTarget, targetDistance } from './sketch-targets';

const paint = { fill: 'none', stroke: '#000000' };

describe('sketch shapes as SVG elements (design 019 E11)', () => {
  it('knows similarities', () => {
    expect(similarity(IDENTITY)).toEqual({ k: 1, theta: 0 });
    const r = Math.PI / 6;
    const s = similarity({
      a: 2 * Math.cos(r),
      b: 2 * Math.sin(r),
      c: -2 * Math.sin(r),
      d: 2 * Math.cos(r),
      e: 5,
      f: 6,
    });
    expect(s!.k).toBeCloseTo(2, 12);
    expect(s!.theta).toBeCloseTo(r, 12);
    expect(similarity({ a: 1, b: 0, c: 0, d: 2, e: 0, f: 0 })).toBeNull();
    expect(similarity({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBeNull();
  });

  it('writes a regular polygon as <polygon points>, in a rotated parent too', () => {
    const square = { kind: 'polygon' as const, c: { x: 0, y: 0 }, r: 10, sides: 4, angle: 0 };
    expect(shapeSpec(square, null, paint)).toEqual({
      tag: 'polygon',
      attrs: { points: '10,0 0,10 -10,0 0,-10', ...paint },
    });
    // a parent rotated by 90° and scaled by 2: the numbers are converted
    const m = { a: 0, b: 2, c: -2, d: 0, e: 0, f: 0 };
    expect(shapeSpec(square, m, {}).attrs['points']).toBe('0,20 -20,0 0,-20 20,0');
  });

  it('writes plain elements in document space', () => {
    expect(shapeSpec({ kind: 'circle', c: { x: 10, y: 20 }, r: 5 }, null, paint)).toEqual({
      tag: 'circle',
      attrs: { cx: '10', cy: '20', r: '5', ...paint },
    });
    expect(
      shapeSpec({ kind: 'rect', c: { x: 50, y: 50 }, w: 40, h: 20, angle: 0 }, IDENTITY, {}),
    ).toEqual({ tag: 'rect', attrs: { x: '30', y: '40', width: '40', height: '20' } });
    const rot = shapeSpec(
      { kind: 'rect', c: { x: 50, y: 50 }, w: 40, h: 20, angle: -Math.PI / 6 },
      null,
      {},
    );
    expect(rot.attrs['transform']).toBe('rotate(-30 50 50)');
  });

  it('arcs: flags from the sweep', () => {
    const small = shapeSpec(
      { kind: 'arc', c: { x: 0, y: 0 }, r: 10, start: 0, sweep: Math.PI / 2 },
      null,
      {},
    );
    expect(small.attrs['d']).toBe('M 10 0 A 10 10 0 0 1 0 10');
    const large = shapeSpec(
      { kind: 'arc', c: { x: 0, y: 0 }, r: 10, start: 0, sweep: -1.5 * Math.PI },
      null,
      {},
    );
    expect(large.attrs['d']).toBe('M 10 0 A 10 10 0 1 0 0 10');
  });

  it('converts into a similar parent; else keeps document numbers with the matrix', () => {
    // parent scaled by 2 and moved: document → local halves and shifts back
    const toLocal = { a: 0.5, b: 0, c: 0, d: 0.5, e: -10, f: -20 };
    expect(shapeSpec({ kind: 'circle', c: { x: 100, y: 100 }, r: 50 }, toLocal, {}).attrs).toEqual({
      cx: '40',
      cy: '30',
      r: '25',
    });
    const skew = { a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 };
    const s = shapeSpec({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, skew, {});
    expect(s.attrs).toEqual({
      x1: '0',
      y1: '0',
      x2: '10',
      y2: '0',
      transform: 'matrix(1 0 0.5 1 0 0)',
    });
  });
});

describe('SVG arc centre (F.6.5)', () => {
  it('finds centre, sweep and tangents', () => {
    const a = arcCenter(
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { rx: 10, ry: 10, rot: 0, large: 0, sweep: 1 },
    )!;
    expect(a.c.x).toBeCloseTo(0, 9);
    expect(a.c.y).toBeCloseTo(0, 9);
    expect(a.delta).toBeCloseTo(Math.PI / 2, 9);
    const t = arcTangentAt(a, a.theta1 + a.delta);
    expect(t.x).toBeCloseTo(-10, 9);
    expect(t.y).toBeCloseTo(0, 9);
    // radii too small are scaled up
    const b = arcCenter(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { rx: 10, ry: 10, rot: 0, large: 0, sweep: 0 },
    )!;
    expect(b.rx).toBeCloseTo(50, 9);
    expect(
      arcCenter({ x: 0, y: 0 }, { x: 0, y: 0 }, { rx: 1, ry: 1, rot: 0, large: 0, sweep: 0 }),
    ).toBeNull();
  });
});

describe('sketch targets (design 019 E10)', () => {
  const seg = (key: string, ax: number, ay: number, bx: number, by: number): SketchTarget => ({
    key,
    tangent: { kind: 'line', p: { x: ax, y: ay }, d: { x: 1, y: 0 } },
    draw: { kind: 'segment', a: { x: ax, y: ay }, b: { x: bx, y: by } },
  });
  const circle: SketchTarget = {
    key: 'c',
    tangent: { kind: 'circle', c: { x: 0, y: 0 }, r: 50 },
    draw: { kind: 'circle', c: { x: 0, y: 0 }, r: 50 },
  };

  it('measures to segments (clamped) and circle rims', () => {
    expect(targetDistance(seg('s', 0, 0, 10, 0), { x: 5, y: 3 })).toBe(3);
    expect(targetDistance(seg('s', 0, 0, 10, 0), { x: 13, y: 4 })).toBe(5);
    expect(targetDistance(circle, { x: 0, y: 47 })).toBe(3);
  });

  it('picks the nearest within the tolerance, never one taken', () => {
    const far = { ...circle, draw: { kind: 'circle' as const, c: { x: 0, y: 300 }, r: 50 } };
    const all = [seg('a', 0, 0, 100, 0), seg('b', 0, 6, 100, 6), far];
    expect(nearestTarget(all, { x: 50, y: 2 }, 8)?.key).toBe('a');
    expect(nearestTarget(all, { x: 50, y: 2 }, 8, ['a'])?.key).toBe('b');
    expect(nearestTarget(all, { x: 50, y: 30 }, 8)).toBeNull();
    const anchors = [{ key: 'e', anchor: { p: { x: 10, y: 10 }, t: { x: 1, y: 0 } } }];
    expect(nearestAnchor(anchors, { x: 13, y: 14 }, 8)?.key).toBe('e');
    expect(nearestAnchor(anchors, { x: 30, y: 10 }, 8)).toBeNull();
  });
});

describe('dimension fields (design 019 E6)', () => {
  it('reads comma and point, a trailing degree sign; shows two decimals', () => {
    expect(parseValue('12,5')).toBe(12.5);
    expect(parseValue(' 30° ')).toBe(30);
    expect(parseValue('-.5')).toBe(-0.5);
    expect(parseValue('1e3')).toBeNull();
    expect(parseValue('abc')).toBeNull();
    expect(formatValue(1 / 3)).toBe('0.33');
    expect(formatValue(200)).toBe('200');
    expect(formatValue(undefined)).toBe('');
  });
});
