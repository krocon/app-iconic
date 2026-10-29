import { Point } from '../view-transform';
import { PaperScope } from './boolean-ops';

/**
 * Trim and Extend (prompt 050, like Fusion 360's sketch tools): the piece of an outline between
 * its neighbouring crossings with the other outlines is cut away; an open end is lengthened along
 * its direction to the next outline. Path data in one space (document units); open and closed
 * subpaths as drawn (no implicit closing). Curve-exact with paper.js.
 */

type PPath = paper.Path;

/** Below this distance (document units) two crossings / ends count as one. */
const EPS = 1e-6;
/** How far an end may be lengthened (the canvas is 1024 wide). */
export const EXTEND_REACH = 100_000;

function children(scope: PaperScope, d: string): PPath[] {
  const c = new scope.CompoundPath({ pathData: d, insert: false });
  return [...(c.children as PPath[])].map((p) => p.clone({ insert: false }) as PPath);
}

function data(paths: readonly PPath[]): string {
  return paths
    .filter((p) => p.segments.length > 1 && p.length > EPS)
    .map((p) => p.pathData)
    .join(' ');
}

export interface TrimResult {
  /** The outline after the cut (`''`: nothing is left). */
  keep: string;
  /** The piece that goes (for the hover). */
  piece: string;
}

/** Offsets along `path` where it crosses one of `others` (sorted, without doubles). */
function crossings(path: PPath, others: readonly PPath[]): number[] {
  const out: number[] = [];
  const box = path.bounds.expand(1);
  for (const o of others) {
    if (!box.intersects(o.bounds.expand(1))) continue;
    for (const loc of path.getIntersections(o)) out.push(loc.offset);
  }
  // where the path crosses itself (a figure eight, a spiral) counts too
  for (const loc of path.getIntersections(path)) out.push(loc.offset);
  out.sort((a, b) => a - b);
  return out.filter((v, i) => i === 0 || v - out[i - 1] > EPS);
}

/** The part of `path` from offset `a` to `b` (a < b, open path). */
function part(path: PPath, a: number, b: number): PPath | null {
  const c = path.clone({ insert: false }) as PPath;
  if (b < c.length - EPS) c.splitAt(b);
  if (a > EPS) {
    const rest = c.splitAt(a);
    return rest ?? null;
  }
  return c;
}

/**
 * The cut of `target` at `p`: the subpath nearest to `p` (within `tol`) loses the piece between the
 * crossings around `p`; the others stay. `null` when `p` is not on the outline.
 */
export function trimAt(
  scope: PaperScope,
  target: string,
  others: readonly string[],
  p: Point,
  tol: number,
): TrimResult | null {
  const subs = children(scope, target);
  const q = new scope.Point(p.x, p.y);
  let best: { i: number; at: number; d: number } | null = null;
  subs.forEach((s, i) => {
    const loc = s.getNearestLocation(q);
    const d = loc ? loc.point.getDistance(q) : Infinity;
    if (loc && d <= tol && (!best || d < best.d)) best = { i, at: loc.offset, d };
  });
  if (!best) return null;
  const { i, at } = best as { i: number; at: number };
  const s = subs[i];
  const otherPaths = [
    ...others.flatMap((d) => children(scope, d)),
    ...subs.filter((_, k) => k !== i),
  ];
  const xs = crossings(s, otherPaths);
  const len = s.length;
  const rest = subs.filter((_, k) => k !== i);
  if (!s.closed) {
    const before = xs.filter((x) => x < at - EPS && x > EPS).at(-1) ?? null;
    const after = xs.find((x) => x > at + EPS && x < len - EPS) ?? null;
    const kept = [
      before !== null ? part(s, 0, before) : null,
      after !== null ? part(s, after, len) : null,
    ].filter((x): x is PPath => !!x);
    const piece = part(s, before ?? 0, after ?? len);
    return { keep: data([...rest, ...kept]), piece: piece ? data([piece]) : '' };
  }
  // closed: fewer than two crossings → the whole subpath goes
  if (xs.length < 2) return { keep: data(rest), piece: data([s]) };
  const before = xs.filter((x) => x < at).at(-1) ?? xs.at(-1)!;
  const after = xs.find((x) => x > at) ?? xs[0];
  // open the loop at `after` and keep the way round to `before`
  const open = s.clone({ insert: false }) as PPath;
  open.splitAt(after);
  const upto = (before - after + len) % len;
  const keep = part(open, 0, upto);
  const piece = part(open, upto, len);
  return {
    keep: data([...rest, ...(keep ? [keep] : [])]),
    piece: piece ? data([piece]) : '',
  };
}

/**
 * Extend: the open end of `target` nearest to `p` (within `tol`) runs on along its direction to
 * the next of `others` (or its own other subpaths). `null` = no end there or nothing in the way.
 */
export function extendAt(
  scope: PaperScope,
  target: string,
  others: readonly string[],
  p: Point,
  tol: number,
): { keep: string; added: [Point, Point] } | null {
  const subs = children(scope, target);
  const q = new scope.Point(p.x, p.y);
  let best: { i: number; start: boolean; d: number } | null = null;
  subs.forEach((s, i) => {
    if (s.closed || s.segments.length < 2) return;
    for (const start of [true, false]) {
      const e = start ? s.firstSegment.point : s.lastSegment.point;
      const d = e.getDistance(q);
      if (d <= tol && (!best || d < best.d)) best = { i, start, d };
    }
  });
  if (!best) return null;
  const { i, start } = best as { i: number; start: boolean };
  const s = subs[i];
  const end = start ? s.firstSegment.point : s.lastSegment.point;
  const t = start ? s.getTangentAt(0).multiply(-1) : s.getTangentAt(s.length);
  if (!t || t.length < EPS) return null;
  const ray = new scope.Path.Line({
    from: end.add(t.normalize(1e-3)),
    to: end.add(t.normalize(EXTEND_REACH)),
    insert: false,
  });
  const targets = [
    ...others.flatMap((d) => children(scope, d)),
    ...subs.filter((_, k) => k !== i),
    s,
  ];
  let hit: paper.Point | null = null;
  let hitD = Infinity;
  for (const o of targets) {
    for (const loc of ray.getIntersections(o)) {
      const d = loc.point.getDistance(end);
      if (d > 1e-2 && d < hitD) [hit, hitD] = [loc.point, d];
    }
  }
  if (!hit) return null;
  const h = hit as paper.Point;
  const seg = start ? s.firstSegment : s.lastSegment;
  const straight = start
    ? !seg.handleOut || seg.handleOut.isZero()
    : !seg.handleIn || seg.handleIn.isZero();
  const nextStraight =
    (start ? s.segments[1].handleIn : s.segments[s.segments.length - 2].handleOut)?.isZero() ??
    true;
  if (straight && nextStraight) seg.point = h;
  else if (start) s.insert(0, new scope.Segment(h));
  else s.add(h);
  return {
    keep: data(subs),
    added: [
      { x: end.x, y: end.y },
      { x: h.x, y: h.y },
    ],
  };
}
