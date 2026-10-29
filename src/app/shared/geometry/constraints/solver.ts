/**
 * A small numeric solver for sketch constraints (prompt 059): Gauss–Newton with the minimum-norm
 * step `dx = −Jᵀ (J Jᵀ + μI)⁻¹ r`, so an under-determined sketch changes as little as possible
 * (what was not asked to move stays where it is), a numeric Jacobian (central differences) and a
 * step halving line search. Dense and pure – sketches of an icon have tens of variables, not
 * thousands (decision 059 E2: TypeScript, no dependency; planegcs is LGPL, SolveSpace GPL).
 */

export interface SolveOptions {
  /** Variables that must not change (e.g. the point being dragged). */
  fixed?: ReadonlySet<number>;
  /** Largest residual that counts as solved (document units / radians). */
  tolerance?: number;
  maxIterations?: number;
}

export interface SolveResult {
  x: number[];
  ok: boolean;
  /** Largest absolute residual at `x`. */
  error: number;
  iterations: number;
}

const maxAbs = (r: readonly number[]) => r.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const sumSq = (r: readonly number[]) => r.reduce((s, v) => s + v * v, 0);

/** Solves `A y = b` (A symmetric positive definite, small) by Cholesky; `null` if singular. */
export function choleskySolve(a: number[][], b: readonly number[]): number[] | null {
  const n = b.length;
  const l = a.map((row) => row.map(() => 0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (!(s > 1e-300)) return null;
        l[i][i] = Math.sqrt(s);
      } else l[i][j] = s / l[j][j];
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= l[i][k] * y[k];
    y[i] = s / l[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= l[k][i] * x[k];
    x[i] = s / l[i][i];
  }
  return x;
}

/** The Jacobian of `f` at `x` (rows = residuals) over the free variables. */
function jacobian(
  f: (x: number[]) => number[],
  x: number[],
  m: number,
  free: readonly number[],
): number[][] {
  const j = Array.from({ length: m }, () => new Array<number>(x.length).fill(0));
  for (const k of free) {
    const h = 1e-6 * Math.max(1, Math.abs(x[k]));
    const xp = [...x];
    const xm = [...x];
    xp[k] += h;
    xm[k] -= h;
    const rp = f(xp);
    const rm = f(xm);
    for (let i = 0; i < m; i++) j[i][k] = (rp[i] - rm[i]) / (2 * h);
  }
  return j;
}

export function solve(
  f: (x: number[]) => number[],
  x0: readonly number[],
  opts: SolveOptions = {},
): SolveResult {
  const tol = opts.tolerance ?? 1e-6;
  const fixed = opts.fixed ?? new Set<number>();
  const free = x0.map((_, i) => i).filter((i) => !fixed.has(i));
  let x = [...x0];
  let r = f(x);
  const m = r.length;
  let it = 0;
  for (; it < (opts.maxIterations ?? 100); it++) {
    if (maxAbs(r) <= tol) return { x, ok: true, error: maxAbs(r), iterations: it };
    const j = jacobian(f, x, m, free);
    // (J Jᵀ + μI) y = r
    const a = j.map((ri) => j.map((rk) => ri.reduce((s, v, c) => s + v * rk[c], 0)));
    const trace = a.reduce((s, row, i) => s + row[i], 0);
    const mu = 1e-10 * Math.max(trace / Math.max(m, 1), 1e-12);
    a.forEach((row, i) => (row[i] += mu));
    const y = choleskySolve(a, r);
    if (!y) break;
    const dx = x.map((_, c) => -j.reduce((s, row, i) => s + row[c] * y[i], 0));
    // step halving until the residual shrinks
    const before = sumSq(r);
    let step = 1;
    let next: number[] | null = null;
    let rn: number[] = r;
    for (let k = 0; k < 30; k++, step /= 2) {
      const cand = x.map((v, c) => v + step * dx[c]);
      const rc = f(cand);
      if (rc.every(Number.isFinite) && sumSq(rc) < before) {
        next = cand;
        rn = rc;
        break;
      }
    }
    if (!next) break;
    x = next;
    r = rn;
  }
  const error = maxAbs(r);
  return { x, ok: error <= tol, error, iterations: it };
}
