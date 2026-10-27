import { Point } from '../view-transform';
import { Circle, dist, dot, EPS, normal, sub } from './sketch-shapes';

/**
 * Circles tangent to lines and circles (design 019 E9) – the problem of Apollonius, solved
 * algebraically. Unknowns (x, y, r), or (x, y) with a fixed radius. A line (unit normal n, point
 * p, side s) gives n·(c − p) = s·r; a circle (centre cⱼ, radius rⱼ, σ = ±1) gives
 * |c − cⱼ|² = (rⱼ + σ·r)²; a point is a circle of radius 0. Every quadratic equation reads
 * `x² + y² − r² + linear = 0`, so differences are linear: what is left is a line in the space of
 * unknowns put into one quadratic – at most two solutions per choice of sides. Each solution is
 * polished with Newton steps on the squared equations. Pure.
 */

export type Tangent =
  /** An (infinite) straight line through `p` with unit direction `d`. */
  { kind: 'line'; p: Point; d: Point } | { kind: 'circle'; c: Point; r: number };

export interface TangentOptions {
  /** The circle passes through this point. */
  point?: Point;
  /** The circle has this radius. */
  radius?: number;
  /** Per target: the side of a line the centre must be on (`normal(d)`·(c − p) sign), else both. */
  sides?: readonly (1 | -1 | null)[];
}

/** One equation: `q·(x² + y² − r²) + a·u + b = 0` (`r²` only when r is unknown). */
interface Eq {
  q: boolean;
  a: number[];
  b: number;
}

/** A condition with its chosen sign – also used to check and polish. */
type Cond =
  | { kind: 'line'; n: Point; p: Point; s: number }
  | { kind: 'circle'; c: Point; r: number; sigma: number };

function equation(k: Cond, fixed: number | null): Eq {
  if (k.kind === 'line') {
    const b = -dot(k.n, k.p);
    return fixed === null
      ? { q: false, a: [k.n.x, k.n.y, -k.s], b }
      : { q: false, a: [k.n.x, k.n.y], b: b - k.s * fixed };
  }
  const { c, r, sigma } = k;
  const cc = c.x * c.x + c.y * c.y;
  return fixed === null
    ? { q: true, a: [-2 * c.x, -2 * c.y, -2 * sigma * r], b: cc - r * r }
    : { q: true, a: [-2 * c.x, -2 * c.y], b: cc - (r + sigma * fixed) ** 2 };
}

/** Solves a small linear system (Gauss with pivoting); `null` if singular. */
function solveLinear(m: number[][], v: number[]): number[] | null {
  const n = v.length;
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let k = col; k <= n; k++) a[r][k] -= f * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

const cross3 = (u: number[], v: number[]) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const dotN = (u: number[], v: number[]) => u.reduce((s, x, i) => s + x * v[i], 0);

/** Roots of A t² + B t + C = 0. */
function quadratic(A: number, B: number, C: number): number[] {
  const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C), 1e-300);
  if (Math.abs(A) < 1e-14 * scale) return Math.abs(B) < 1e-14 * scale ? [] : [-C / B];
  const disc = B * B - 4 * A * C;
  if (disc < -1e-12 * B * B - 1e-12) return [];
  const s = Math.sqrt(Math.max(0, disc));
  // numerically stable form
  const q = -0.5 * (B + (B >= 0 ? s : -s));
  const roots = q === 0 ? [0] : [q / A, C / q];
  return roots;
}

/** All solutions u of the system (dimension 2 or 3). */
function solveSystem(eqs: Eq[], dim: number): number[][] {
  const quads = eqs.filter((e) => e.q);
  const lins = eqs.filter((e) => !e.q);
  const base = quads[0];
  const linear = [
    ...lins,
    ...quads
      .slice(1)
      .map((e) => ({ q: false, a: e.a.map((x, i) => x - base.a[i]), b: e.b - base.b })),
  ];
  if (!base) {
    const u = solveLinear(
      linear.map((e) => e.a),
      linear.map((e) => -e.b),
    );
    return u ? [u] : [];
  }
  // the line u0 + t·v that solves the linear equations
  let u0: number[];
  let v: number[];
  if (dim === 2) {
    const [e] = linear;
    const n2 = dotN(e.a, e.a);
    if (n2 < 1e-18) return [];
    v = [-e.a[1], e.a[0]];
    u0 = e.a.map((x) => (-e.b * x) / n2);
  } else {
    const [e1, e2] = linear;
    v = cross3(e1.a, e2.a);
    if (dotN(v, v) < 1e-18) return [];
    // minimal norm solution of [a1; a2] u = [−b1; −b2]
    const g = [
      [dotN(e1.a, e1.a), dotN(e1.a, e2.a)],
      [dotN(e2.a, e1.a), dotN(e2.a, e2.a)],
    ];
    const w = solveLinear(g, [-e1.b, -e2.b]);
    if (!w) return [];
    u0 = e1.a.map((x, i) => w[0] * x + w[1] * e2.a[i]);
  }
  const m = dim === 3 ? [1, 1, -1] : [1, 1];
  const A = v.reduce((s, x, i) => s + m[i] * x * x, 0);
  const B = 2 * v.reduce((s, x, i) => s + m[i] * x * u0[i], 0) + dotN(base.a, v);
  const C = u0.reduce((s, x, i) => s + m[i] * x * x, 0) + dotN(base.a, u0) + base.b;
  return quadratic(A, B, C).map((t) => u0.map((x, i) => x + t * v[i]));
}

/** Residuals of the squared conditions and their Jacobian at (x, y, r). */
function residuals(conds: Cond[], x: number, y: number, r: number, fixed: boolean) {
  const f: number[] = [];
  const j: number[][] = [];
  for (const k of conds) {
    if (k.kind === 'line') {
      f.push(k.n.x * (x - k.p.x) + k.n.y * (y - k.p.y) - k.s * r);
      j.push(fixed ? [k.n.x, k.n.y] : [k.n.x, k.n.y, -k.s]);
    } else {
      const e = k.r + k.sigma * r;
      const dx = x - k.c.x;
      const dy = y - k.c.y;
      f.push(dx * dx + dy * dy - e * e);
      j.push(fixed ? [2 * dx, 2 * dy] : [2 * dx, 2 * dy, -2 * k.sigma * e]);
    }
  }
  return { f, j };
}

/** A few Newton steps (the algebra loses digits when the targets are far apart). */
function polish(conds: Cond[], u: number[], fixed: number | null): number[] {
  let cur = [...u];
  for (let i = 0; i < 4; i++) {
    const r = fixed ?? cur[2];
    const { f, j } = residuals(conds, cur[0], cur[1], r, fixed !== null);
    const step = solveLinear(
      j,
      f.map((x) => -x),
    );
    if (!step || !step.every(Number.isFinite)) break;
    const next = cur.map((x, k) => x + step[k]);
    const before = Math.max(...f.map(Math.abs));
    const after = Math.max(
      ...residuals(conds, next[0], next[1], fixed ?? next[2], fixed !== null).f.map(Math.abs),
    );
    if (!(after <= before)) break;
    cur = next;
  }
  return cur;
}

/** How far the circle is from touching condition `k` (unsquared, in document units). */
function miss(k: Cond, c: Point, r: number): number {
  if (k.kind === 'line') return Math.abs(dot(k.n, sub(c, k.p)) - k.s * r);
  return Math.abs(dist(c, k.c) - Math.abs(k.r + k.sigma * r));
}

/** Every circle tangent to the targets (and through `point` / with `radius`); duplicates merged. */
export function tangentCircles(targets: readonly Tangent[], opts: TangentOptions = {}): Circle[] {
  const fixed = opts.radius !== undefined && opts.radius > 0 ? opts.radius : null;
  const count = targets.length + (opts.point ? 1 : 0) + (fixed !== null ? 1 : 0);
  if (count !== 3) return [];
  // all choices of side per target
  let combos: Cond[][] = [[]];
  targets.forEach((t, i) => {
    const next: Cond[][] = [];
    for (const combo of combos) {
      if (t.kind === 'line') {
        const n = normal(t.d);
        const forced = opts.sides?.[i] ?? null;
        for (const s of forced ? [forced] : [1, -1])
          next.push([...combo, { kind: 'line', n, p: t.p, s }]);
      } else {
        for (const sigma of [1, -1])
          next.push([...combo, { kind: 'circle', c: t.c, r: t.r, sigma }]);
      }
    }
    combos = next;
  });
  const point = opts.point;
  const out: Circle[] = [];
  for (const combo of combos) {
    const conds: Cond[] = point ? [...combo, { kind: 'circle', c: point, r: 0, sigma: 1 }] : combo;
    for (const raw of solveSystem(
      conds.map((k) => equation(k, fixed)),
      fixed === null ? 3 : 2,
    )) {
      if (!raw.every(Number.isFinite)) continue;
      const u = polish(conds, raw, fixed);
      const c = { x: u[0], y: u[1] };
      const r = fixed ?? u[2];
      if (!(r > EPS)) continue;
      const size = Math.max(1, r, Math.abs(c.x), Math.abs(c.y));
      if (conds.some((k) => miss(k, c, r) > 1e-7 * size)) continue;
      if (out.some((o) => dist(o.c, c) < 1e-6 * size && Math.abs(o.r - r) < 1e-6 * size)) continue;
      out.push({ c, r });
    }
  }
  return out;
}

/** The solution that contains `p` (smallest), else the one whose rim is nearest to `p`. */
export function pickByPointer(solutions: readonly Circle[], p: Point): Circle | null {
  const inside = solutions.filter((s) => dist(s.c, p) < s.r).sort((a, b) => a.r - b.r);
  if (inside.length) return inside[0];
  let best: Circle | null = null;
  let bestD = Infinity;
  for (const s of solutions) {
    const d = Math.abs(dist(s.c, p) - s.r);
    if (d < bestD) [best, bestD] = [s, d];
  }
  return best;
}

/** The solution whose centre is nearest to `p`. */
export function pickNearestCenter(solutions: readonly Circle[], p: Point): Circle | null {
  let best: Circle | null = null;
  for (const s of solutions) if (!best || dist(s.c, p) < dist(best.c, p)) best = s;
  return best;
}

/** The smallest solution. */
export function pickSmallest(solutions: readonly Circle[]): Circle | null {
  return solutions.reduce<Circle | null>((b, s) => (!b || s.r < b.r ? s : b), null);
}

/** The side of line target `t` that `p` is on (for "the centre stays on the pointer's side"). */
export function sideOf(t: Tangent, p: Point): 1 | -1 | null {
  if (t.kind !== 'line') return null;
  const s = dot(normal(t.d), sub(p, t.p));
  return Math.abs(s) < EPS ? null : s > 0 ? 1 : -1;
}
