import { IDENTITY, Matrix } from '../matrix';
import { Constraint, fits, measure, systemResiduals } from './constraints';
import { attributesOf, entityOf, paramsOf, SketchElement, systemOf } from './sketch-model';
import { solve } from './solver';

const el = (cid: string, kind: SketchElement['kind'], params: number[], m: Matrix = IDENTITY) =>
  ({ cid, kind, params, m }) as SketchElement;

function run(elements: SketchElement[], cs: Constraint[], fixed: number[] = []) {
  const sys = systemOf(elements);
  const { f } = systemResiduals(sys, cs);
  return { sys, r: solve(f, sys.x0, { fixed: new Set(fixed) }) };
}

describe('constraints (prompt 059)', () => {
  it('a rectangle with driving dimensions: width and height follow, the corner stays', () => {
    const rect = el('r', 'rect', [10, 20, 110, 70]);
    const fix: Constraint = { id: 'k0', type: 'fix', refs: ['r.tl'], point: [10, 20] };
    const w: Constraint = { id: 'k1', type: 'length', refs: ['r.top'], value: 200 };
    const h: Constraint = { id: 'k2', type: 'length', refs: ['r.left'], value: 80 };
    const { r } = run([rect], [fix, w, h]);
    expect(r.ok).toBe(true);
    expect(attributesOf('rect', r.x)).toEqual({ x: '10', y: '20', width: '200', height: '80' });
  });

  it('a line becomes tangent to a circle; the circle does not move when it need not', () => {
    const line = el('l', 'line', [0, 0, 100, 10]);
    const circle = el('c', 'circle', [50, 50, 20]);
    const { sys, r } = run(
      [line, circle],
      [
        { id: 'k1', type: 'horizontal', refs: ['l.line'] },
        { id: 'k2', type: 'tangent', refs: ['l.line', 'c.circle'] },
        { id: 'k3', type: 'fix', refs: ['c.center'], point: [50, 50] },
        { id: 'k4', type: 'radius', refs: ['c.circle'], value: 20 },
      ],
    );
    expect(r.ok).toBe(true);
    const l = entityOf(sys, 'l.line')!.at(r.x) as { a: { y: number }; b: { y: number } };
    expect(l.a.y).toBeCloseTo(30, 5);
    expect(l.b.y).toBeCloseTo(30, 5);
    r.x.slice(4).forEach((v, i) => expect(v).toBeCloseTo([50, 50, 20][i], 6));
  });

  it('works across transforms: elements in a scaled group meet in document units', () => {
    // b's user space is scaled ×2 and moved by 100
    const m = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 0 };
    const a = el('a', 'line', [0, 0, 50, 0]);
    const b = el('b', 'line', [0, 10, 20, 30], m);
    const { sys, r } = run([a, b], [{ id: 'k', type: 'coincident', refs: ['a.p2', 'b.p1'] }]);
    expect(r.ok).toBe(true);
    const p = entityOf(sys, 'a.p2')!.at(r.x) as { x: number; y: number };
    const q = entityOf(sys, 'b.p1')!.at(r.x) as { x: number; y: number };
    expect(p.x).toBeCloseTo(q.x, 6);
    expect(p.y).toBeCloseTo(q.y, 6);
  });

  it('parallel, perpendicular, equal, midpoint, symmetric, angle hold after solving', () => {
    const els = [
      el('a', 'line', [0, 0, 100, 5]),
      el('b', 'line', [0, 50, 80, 70]),
      el('c', 'line', [200, 0, 210, 90]),
      el('p', 'poly', [40, 40, 60, 60, 80, 20]),
    ];
    const cs: Constraint[] = [
      { id: '1', type: 'parallel', refs: ['a.line', 'b.line'] },
      { id: '2', type: 'perpendicular', refs: ['a.line', 'c.line'] },
      { id: '3', type: 'equal', refs: ['a.line', 'c.line'] },
      { id: '4', type: 'midpoint', refs: ['p.p0', 'a.line'] },
      { id: '5', type: 'symmetric', refs: ['p.p1', 'p.p2', 'b.line'] },
    ];
    const { sys, r } = run(els, cs);
    expect(r.ok).toBe(true);
    expect(
      systemResiduals(sys, cs)
        .f(r.x)
        .every((v) => Math.abs(v) < 1e-6),
    ).toBe(true);
    const ang: Constraint = { id: '6', type: 'angle', refs: ['a.line', 'b.line'], value: 30 };
    const r2 = solve(systemResiduals(sys, [ang]).f, sys.x0);
    expect(r2.ok).toBe(true);
    expect(measure({ ...sys, x0: r2.x }, ang)).toBeCloseTo(30, 3);
  });

  it('measures, checks the kinds, reports contradictions', () => {
    const sys = systemOf([el('r', 'rect', [0, 0, 30, 40]), el('c', 'circle', [0, 0, 5])]);
    expect(measure(sys, { id: 'm', type: 'distance', refs: ['r.tl', 'r.br'] })).toBe(50);
    expect(measure(sys, { id: 'm', type: 'diameter', refs: ['c.circle'] })).toBe(10);
    expect(fits('tangent', ['line', 'circle'])).toBe(true);
    expect(fits('tangent', ['point'])).toBe(false);
    expect(fits('symmetric', ['point', 'point'], false)).toBe(true);
    const { r } = run(
      [el('l', 'line', [0, 0, 10, 0])],
      [
        { id: '1', type: 'length', refs: ['l.line'], value: 10 },
        { id: '2', type: 'length', refs: ['l.line'], value: 20 },
      ],
    );
    expect(r.ok).toBe(false);
  });

  it('reads and writes the numbers of the elements', () => {
    const attrs: Record<string, string> = { points: '0,0 10 0 10,10' };
    expect(paramsOf('polygon', (n) => attrs[n] ?? null)).toEqual({
      kind: 'poly',
      params: [0, 0, 10, 0, 10, 10],
      closed: true,
    });
    expect(paramsOf('rect', (n) => ({ width: '5', height: '50%' })[n] ?? null)).toBeNull();
    expect(paramsOf('rect', (n) => ({ width: '5', height: '6' })[n] ?? null)?.params).toEqual([
      0, 0, 5, 6,
    ]);
    expect(
      paramsOf('rect', (n) => ({ x: '1', width: '5', height: '6' })[n] ?? null)?.params,
    ).toEqual([1, 0, 6, 6]);
    expect(attributesOf('rect', [10, 10, 6, 15])).toEqual({
      x: '6',
      y: '10',
      width: '4',
      height: '5',
    });
  });
});
