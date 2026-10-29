import { Point } from '../view-transform';
import { PaperScope } from './boolean-ops';

/**
 * Fillet and Chamfer between two outlines (prompt 051, like Fusion 360's sketch fillet): the
 * corner where they meet is cut back to the tangent points of a circle of radius `r` (fillet) or
 * to points `r` along each (chamfer) and bridged by the arc / a straight line. Works for lines,
 * arcs and Bézier curves (the circle's centre is found by Newton on the distances), and for a
 * corner inside one path (a polygon corner, a corner next to a curved side). Path data in one
 * space (document units). Curve-exact with paper.js.
 */

type PPath = paper.Path;
export type CornerKind = 'fillet' | 'chamfer';

/** One side of the corner: the outline and which part of it stays (the point clicked). */
export interface Side {
  d: string;
  /** A point on the side that stays. */
  p: Point;
}

export type FilletError = 'noSide' | 'noCorner' | 'tooLarge';

export interface FilletResult {
  /** New path data of the first side's element (with its other subpaths). */
  a: string;
  /** New path data of the second side's element (`null`: the same element as `a`). */
  b: string | null;
  /** The tangent points and the circle (for the preview). */
  ta: Point;
  tb: Point;
  center: Point | null;
}

const EPS = 1e-6;

function subs(scope: PaperScope, d: string): PPath[] {
  const c = new scope.CompoundPath({ pathData: d, insert: false });
  return [...(c.children as PPath[])].map((p) => p.clone({ insert: false }) as PPath);
}

const data = (paths: readonly PPath[]) =>
  paths
    .filter((p) => p.segments.length > 1)
    .map((p) => p.pathData)
    .join(' ');

/** The subpath of `paths` nearest to `p` and the offset there. */
function nearest(
  paths: readonly PPath[],
  p: paper.Point,
): { i: number; at: number; d: number } | null {
  let best: { i: number; at: number; d: number } | null = null;
  paths.forEach((s, i) => {
    const loc = s.getNearestLocation(p);
    if (loc && (!best || loc.distance < best.d)) best = { i, at: loc.offset, d: loc.distance };
  });
  return best;
}

/** The part of an open path from offset `a` to `b` (a ≤ b). */
function part(path: PPath, a: number, b: number): PPath | null {
  const c = path.clone({ insert: false }) as PPath;
  if (b < c.length - EPS) c.splitAt(b);
  if (a > EPS) return c.splitAt(a) ?? null;
  return c;
}

/** A closed path opened opposite `at`; returns the path and where `at` is now. */
function openAround(path: PPath, at: number): { path: PPath; at: number } {
  if (!path.closed) return { path, at };
  const len = path.length;
  const cut = (at + len / 2) % len;
  const c = path.clone({ insert: false }) as PPath;
  c.splitAt(cut);
  return { path: c, at: (at - cut + len) % len };
}

/** The vertex (segment point) of `path` nearest to offset `at`. */
function vertexNear(path: PPath, at: number): number | null {
  let best: number | null = null;
  for (const s of path.segments) {
    const o = path.getOffsetOf(s.point);
    if (best === null || Math.abs(o - at) < Math.abs(best - at)) best = o;
  }
  return best;
}

/**
 * The corner between `first` and `second` (the two clicks), or – with `second` = `null` – the
 * corner of `first`'s path nearest to the click. `r` = radius (fillet) or distance (chamfer).
 */
export function filletCorner(
  scope: PaperScope,
  first: Side,
  second: Side | null,
  r: number,
  kind: CornerKind,
  tol: number,
): FilletResult | FilletError {
  const P = (p: Point) => new scope.Point(p.x, p.y);
  const A = subs(scope, first.d);
  const na = nearest(A, P(first.p));
  if (!na || na.d > tol) return 'noSide';
  const same = second === null || second.d === first.d;
  const B = same ? A : subs(scope, second.d);
  const nb = second ? nearest(B, P(second.p)) : na;
  if (!nb || nb.d > tol) return 'noSide';

  if (same && na.i === nb.i) {
    // a corner inside one path: the vertex nearest to the click(s)
    const { path, at } = openAround(A[na.i], second ? (na.at + nb.at) / 2 : na.at);
    const v = vertexNear(path, at);
    if (v === null || v < EPS || v > path.length - EPS) return 'noCorner';
    const res = cornerOnPath(scope, path, v, r, kind);
    if (typeof res === 'string') return res;
    const out = [...A];
    out[na.i] = res.path;
    if (A[na.i].closed) res.path.closed = true;
    return { a: data(out), b: null, ta: res.ta, tb: res.tb, center: res.center };
  }

  // two outlines: the crossing nearest to the two clicks
  const ca = A[na.i];
  const cb = B[nb.i];
  const mid = P(first.p).add(P(second!.p)).divide(2);
  let x: paper.CurveLocation | null = null;
  for (const loc of ca.getIntersections(cb)) {
    if (!x || loc.point.getDistance(mid) < x.point.getDistance(mid)) x = loc;
  }
  if (!x) return 'noCorner';
  const X = x.point;
  const oxa = ca.getOffsetOf(X);
  const oxb = cb.getOffsetOf(X);
  const sa = Math.sign(na.at - oxa) || 1;
  const sb = Math.sign(nb.at - oxb) || 1;
  const t = tangentPoints(scope, ca, oxa, sa, cb, oxb, sb, X, r, kind);
  if (typeof t === 'string') return t;
  // each side keeps the part from its tangent point towards the click
  const keepA = sa > 0 ? part(ca, t.oa, ca.length) : part(ca, 0, t.oa);
  const keepB = sb > 0 ? part(cb, t.ob, cb.length) : part(cb, 0, t.ob);
  if (!keepA || !keepB) return 'tooLarge';
  const bridge = bridgeOf(scope, t.ta, t.tb, t.center, X, kind);
  keepA.join(bridge, 1e-4);
  if (same) {
    keepA.join(keepB, 1e-4);
    const out = A.filter((_, k) => k !== na.i && k !== nb.i);
    return {
      a: data([...out, keepA]),
      b: null,
      ta: pt(t.ta),
      tb: pt(t.tb),
      center: t.center && pt(t.center),
    };
  }
  const outA = [...A];
  outA[na.i] = keepA;
  const outB = [...B];
  outB[nb.i] = keepB;
  return {
    a: data(outA),
    b: data(outB),
    ta: pt(t.ta),
    tb: pt(t.tb),
    center: t.center && pt(t.center),
  };
}

const pt = (p: paper.Point): Point => ({ x: p.x, y: p.y });

/** A corner at offset `at` of one open path: cut back on both sides and bridged. */
function cornerOnPath(scope: PaperScope, path: PPath, at: number, r: number, kind: CornerKind) {
  const X = path.getPointAt(at);
  const t = tangentPoints(scope, path, at, -1, path, at, 1, X, r, kind);
  if (typeof t === 'string') return t;
  const before = part(path, 0, t.oa);
  const after = part(path, t.ob, path.length);
  if (!before || !after) return 'tooLarge' as const;
  before.join(bridgeOf(scope, t.ta, t.tb, t.center, X, kind), 1e-4);
  before.join(after, 1e-4);
  return { path: before, ta: pt(t.ta), tb: pt(t.tb), center: t.center && pt(t.center) };
}

/** The straight line or the arc from `ta` to `tb` (round towards the corner `x`). */
function bridgeOf(
  scope: PaperScope,
  ta: paper.Point,
  tb: paper.Point,
  c: paper.Point | null,
  x: paper.Point,
  kind: CornerKind,
): PPath {
  if (kind === 'chamfer' || !c) return new scope.Path.Line({ from: ta, to: tb, insert: false });
  const r = ta.getDistance(c);
  const through = c.add(x.subtract(c).normalize(r));
  return new scope.Path.Arc({ from: ta, through, to: tb, insert: false });
}

/**
 * Where the corner is cut back: side A from offset `oa0` in direction `sa` (±1), side B likewise.
 * Chamfer: `r` along each side. Fillet: the tangent points of the circle of radius `r` touching
 * both sides in the corner (Newton on the centre; exact for lines in one step).
 */
function tangentPoints(
  scope: PaperScope,
  a: PPath,
  oa0: number,
  sa: number,
  b: PPath,
  ob0: number,
  sb: number,
  x: paper.Point,
  r: number,
  kind: CornerKind,
):
  | { oa: number; ob: number; ta: paper.Point; tb: paper.Point; center: paper.Point | null }
  | FilletError {
  if (!(r > EPS)) return 'tooLarge';
  const inside = (path: PPath, o0: number, s: number, o: number) =>
    s > 0 ? o > o0 + EPS && o < path.length + EPS : o < o0 - EPS && o > -EPS;
  if (kind === 'chamfer') {
    const oa = oa0 + sa * r;
    const ob = ob0 + sb * r;
    if (!inside(a, oa0, sa, oa) || !inside(b, ob0, sb, ob)) return 'tooLarge';
    return { oa, ob, ta: a.getPointAt(oa), tb: b.getPointAt(ob), center: null };
  }
  // the directions away from the corner, on each side of it
  const ua = sideTangent(a, oa0, sa);
  const ub = sideTangent(b, ob0, sb);
  if (!ua || !ub) return 'noCorner';
  const half = Math.acos(Math.max(-1, Math.min(1, ua.dot(ub)))) / 2;
  if (half < 1e-4 || half > Math.PI / 2 - 1e-4) return 'noCorner';
  // start: exact for two straight sides
  let c = x.add(ua.add(ub).normalize(r / Math.sin(half)));
  for (let k = 0; k < 30; k++) {
    const qa = a.getNearestPoint(c);
    const qb = b === a ? nearestOnSide(b, c, ob0, sb) : b.getNearestPoint(c);
    const qa2 = b === a ? nearestOnSide(a, c, oa0, sa) : qa;
    const da = c.subtract(qa2);
    const db = c.subtract(qb);
    const fa = da.length - r;
    const fb = db.length - r;
    if (Math.abs(fa) < 1e-7 && Math.abs(fb) < 1e-7) break;
    const ga = da.normalize();
    const gb = db.normalize();
    const det = ga.x * gb.y - ga.y * gb.x;
    if (Math.abs(det) < 1e-12) break;
    c = c.subtract(new scope.Point((fa * gb.y - fb * ga.y) / det, (ga.x * fb - gb.x * fa) / det));
  }
  const ta = b === a ? nearestOnSide(a, c, oa0, sa) : a.getNearestPoint(c);
  const tb = b === a ? nearestOnSide(b, c, ob0, sb) : b.getNearestPoint(c);
  const oa = a.getOffsetOf(ta);
  const ob = b.getOffsetOf(tb);
  if (!inside(a, oa0, sa, oa) || !inside(b, ob0, sb, ob)) return 'tooLarge';
  if (Math.abs(ta.getDistance(c) - r) > 1e-3 || Math.abs(tb.getDistance(c) - r) > 1e-3) {
    return 'tooLarge';
  }
  return { oa, ob, ta, tb, center: c };
}

/** The nearest point of `path` to `c` on one side of offset `o0` (a corner inside one path). */
function nearestOnSide(path: PPath, c: paper.Point, o0: number, s: number): paper.Point {
  const piece = s > 0 ? part(path, o0, path.length) : part(path, 0, o0);
  return (piece ?? path).getNearestPoint(c);
}

/**
 * The direction away from offset `o` into side `s` (±1): at a vertex the curve on that side, not
 * the one paper.js picks for the offset.
 */
function sideTangent(path: PPath, o: number, s: number): paper.Point | null {
  const loc = path.getLocationAt(Math.min(Math.max(o, 0), path.length));
  if (!loc?.curve) return null;
  let curve: paper.Curve | null = loc.curve;
  let t = loc.time;
  if (s < 0 && t < 1e-9) [curve, t] = [curve.previous, 1];
  if (s > 0 && t > 1 - 1e-9) [curve, t] = [curve.next, 0];
  if (!curve) return null;
  const tan = curve.getTangentAtTime(s < 0 ? Math.max(t - 1e-6, 0) : Math.min(t + 1e-6, 1));
  return tan ? tan.multiply(s).normalize() : null;
}
