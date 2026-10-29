import { choleskySolve, solve } from './solver';

describe('constraint solver (prompt 059)', () => {
  it('Cholesky solves a small SPD system', () => {
    const y = choleskySolve(
      [
        [4, 2],
        [2, 3],
      ],
      [2, 1],
    )!;
    expect(y[0]).toBeCloseTo(0.5);
    expect(y[1]).toBeCloseTo(0);
    expect(choleskySolve([[0]], [1])).toBeNull();
  });

  it('under-determined: the smallest change (only y moves for y = 2)', () => {
    const r = solve((x) => [x[1] - 2], [5, 7]);
    expect(r.ok).toBe(true);
    expect(r.x[0]).toBe(5);
    expect(r.x[1]).toBeCloseTo(2, 6);
  });

  it('non-linear: a point onto a circle, fixed variables stay', () => {
    const f = (x: number[]) => [Math.hypot(x[0], x[1]) - 10];
    const r = solve(f, [3, 4], { fixed: new Set([0]) });
    expect(r.ok).toBe(true);
    expect(r.x[0]).toBe(3);
    expect(Math.hypot(r.x[0], r.x[1])).toBeCloseTo(10, 6);
  });

  it('a contradiction is reported, not hidden', () => {
    const r = solve((x) => [x[0] - 1, x[0] - 2], [0]);
    expect(r.ok).toBe(false);
    expect(r.error).toBeGreaterThan(0.4);
  });
});
