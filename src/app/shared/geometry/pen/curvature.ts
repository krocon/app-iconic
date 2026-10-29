// Übertragen aus Marcs VectorCraft, crates/tools/src/draw2.rs (`arc_handle`, `smooth_handles`,
// `end_handle`, `curvature_spline`; MIT/Apache), Prompt 043.
import { Point } from '../view-transform';
import { PenAnchor } from './pen-path';

/**
 * The Curvature tool's rule (prompt 043): every stretch of three points follows the circle
 * through them – a smooth point's handles lie along that circle's tangent, as long as an arc
 * needs; a turn tighter than 30° comes to a point; the ends of an open path bend into the curve.
 * Points flagged `corner` get no handles. Document units. Pure.
 */

export interface CurvePoint {
  p: Point;
  corner?: boolean;
}

const HANDLE_K = 1 / 3;
/** sin 15°: a turn tighter than 30° shortens the handles. */
const TIGHT_TURN = 0.2588190451025208;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const len = (a: Point) => Math.hypot(a.x, a.y);
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

/** How long a handle along `dir` must be for its segment `chord` to follow a circular arc. */
export function arcHandle(chord: Point, dir: Point): number {
  const l = len(chord);
  const ld = len(dir);
  if (!(l > 1e-9 && ld > 1e-12)) return 0;
  const cos = Math.min(1, Math.max(0, dot(dir, chord) / (ld * l)));
  return (2 * HANDLE_K * l) / (1 + cos);
}

/** The handles `[in, out]` of a smooth point `p` between `prev` and `next`; `null` = a corner. */
export function smoothHandles(prev: Point, p: Point, next: Point): [Point, Point] | null {
  const a = sub(prev, p);
  const b = sub(next, p);
  const la2 = dot(a, a);
  const lb2 = dot(b, b);
  if (!(Number.isFinite(la2) && Number.isFinite(lb2)) || la2 <= 1e-18 || lb2 <= 1e-18) return null;
  // in a line with `p` not between its neighbours the path folds straight back
  if (Math.abs(cross(a, b)) <= 1e-9 * Math.sqrt(la2) * Math.sqrt(lb2) && dot(a, b) > 0) return null;
  const t = sub(mul(b, 1 / lb2), mul(a, 1 / la2));
  const lt = len(t);
  if (!Number.isFinite(lt) || lt * Math.min(Math.sqrt(la2), Math.sqrt(lb2)) <= 1e-9) return null;
  const u = mul(t, 1 / lt);
  const cos = Math.min(1, Math.max(-1, dot(a, b) / (Math.sqrt(la2) * Math.sqrt(lb2))));
  const k = Math.min(1, Math.sqrt((1 - cos) / 2) / TIGHT_TURN) ** 2;
  const hin = sub(p, mul(u, k * arcHandle(a, mul(u, -1))));
  const hout = add(p, mul(u, k * arcHandle(b, u)));
  return finite(hin) && finite(hout) ? [hin, hout] : null;
}

/**
 * The one handle of an end `p` of an open path so its segment to the neighbour `q` follows the
 * same circle as the curve at `q` (`forward`: `p` is the first anchor); `null` = straight.
 */
export function endHandle(p: Point, q: PenAnchor, forward: boolean): Point | null {
  let t: Point;
  if (q.hout) t = sub(q.hout, q.p);
  else if (q.hin) t = sub(q.p, q.hin);
  else return null;
  if (!forward) t = mul(t, -1);
  const chord = sub(q.p, p);
  const lt = len(t);
  const lc = len(chord);
  if (!(lt > 1e-12 && lc > 1e-9)) return null;
  const tu = mul(t, 1 / lt);
  const c = mul(chord, 1 / lc);
  let d = sub(mul(c, 2 * dot(tu, c)), tu);
  const back = sub((forward ? q.hin : q.hout) ?? q.p, q.p);
  const full = arcHandle(sub(p, q.p), back);
  const share = len(back) > 1e-9 && full > 1e-9 ? Math.min(1, len(back) / full) : 1;
  // short of the circle, the end also turns toward its chord in that share
  d = add(mul(c, 1 - share), mul(d, share));
  d = mul(d, 1 / Math.max(len(d), 1e-12));
  const h = add(p, mul(d, share * arcHandle(chord, d)));
  return finite(h) ? h : null;
}

/** The anchors of the path through `points` by the Curvature rule. */
export function curvatureSpline(points: readonly CurvePoint[], closed: boolean): PenAnchor[] {
  const n = points.length;
  const anchors: PenAnchor[] = points.map((pt, i) => {
    const openEnd = !closed && (i === 0 || i === n - 1);
    const h =
      n >= 3 && !pt.corner && !openEnd
        ? smoothHandles(points[(i + n - 1) % n].p, pt.p, points[(i + 1) % n].p)
        : null;
    return h ? { p: pt.p, hin: h[0], hout: h[1] } : { p: pt.p, hin: null, hout: null };
  });
  if (n >= 3 && !closed) {
    const head = !points[0].corner ? endHandle(anchors[0].p, anchors[1], true) : null;
    const tail = !points[n - 1].corner ? endHandle(anchors[n - 1].p, anchors[n - 2], false) : null;
    if (head) anchors[0] = { ...anchors[0], hout: head };
    if (tail) anchors[n - 1] = { ...anchors[n - 1], hin: tail };
  }
  return anchors;
}

/**
 * Makes anchor `i` smooth (Curvature rule from its neighbours) or a corner in place; the other
 * anchors keep their handles. `null` when it cannot be smooth (an end, no direction).
 */
export function curveAnchor(
  anchors: readonly PenAnchor[],
  i: number,
  closed: boolean,
  smooth: boolean,
): PenAnchor[] {
  const n = anchors.length;
  const out = anchors.map((a) => ({ ...a }));
  const a = out[i];
  if (!a) return out;
  if (!smooth) {
    out[i] = { p: a.p, hin: null, hout: null };
    return out;
  }
  const prev = closed || i > 0 ? anchors[(i + n - 1) % n] : null;
  const next = closed || i < n - 1 ? anchors[(i + 1) % n] : null;
  if (prev && next) {
    const h = smoothHandles(prev.p, a.p, next.p);
    out[i] = h ? { p: a.p, hin: h[0], hout: h[1] } : { p: a.p, hin: null, hout: null };
  } else if (next) {
    out[i] = { p: a.p, hin: null, hout: endHandle(a.p, next, true) };
  } else if (prev) {
    out[i] = { p: a.p, hin: endHandle(a.p, prev, false), hout: null };
  }
  return out;
}

/**
 * Anchor `i` moved to `to`: it and its smooth neighbours take new handles by the rule (the
 * segments at it re-curve), the rest of the path keeps its shape (VectorCraft `curvature_move`).
 */
export function moveAnchor(
  anchors: readonly PenAnchor[],
  i: number,
  to: Point,
  closed: boolean,
): PenAnchor[] {
  const smooth = (a: PenAnchor | undefined) => !!a && (!!a.hin || !!a.hout);
  const n = anchors.length;
  const was = anchors.map(smooth);
  let out = anchors.map((a, j) => (j === i ? { ...a, p: to } : { ...a }));
  for (const j of [i - 1, i, i + 1]) {
    const k = closed ? (j + n) % n : j;
    if (k < 0 || k >= n || !was[k]) continue;
    out = curveAnchor(out, k, closed, true);
  }
  return out;
}

/** The cubic of segment `i` (from anchor `i` to the next one). */
export function segmentCurve(
  anchors: readonly PenAnchor[],
  i: number,
): [Point, Point, Point, Point] | null {
  const a = anchors[i];
  const b = anchors[(i + 1) % anchors.length];
  if (!a || !b) return null;
  return [a.p, a.hout ?? a.p, b.hin ?? b.p, b.p];
}

/** A smooth point inserted on segment `i` at `t` without changing the shape (de Casteljau). */
export function insertAnchor(anchors: readonly PenAnchor[], i: number, t: number): PenAnchor[] {
  const c = segmentCurve(anchors, i);
  if (!c) return [...anchors];
  const [p0, p1, p2, p3] = c;
  const lerp = (a: Point, b: Point) => add(a, mul(sub(b, a), t));
  const a1 = lerp(p0, p1);
  const b1 = lerp(p1, p2);
  const c1 = lerp(p2, p3);
  const a2 = lerp(a1, b1);
  const b2 = lerp(b1, c1);
  const m = lerp(a2, b2);
  const straight = !anchors[i].hout && !anchors[(i + 1) % anchors.length].hin;
  const out = anchors.map((x) => ({ ...x }));
  const j = (i + 1) % anchors.length;
  if (!straight) {
    out[i] = { ...out[i], hout: a1 };
    out[j] = { ...out[j], hin: c1 };
  }
  const mid: PenAnchor = straight ? { p: m, hin: null, hout: null } : { p: m, hin: a2, hout: b2 };
  out.splice(i + 1, 0, mid);
  return out;
}

/** The point of segment `i` nearest to `p`: its `t` and distance (sampled, then refined). */
export function nearestOnSegment(
  anchors: readonly PenAnchor[],
  i: number,
  p: Point,
): { t: number; d: number } | null {
  const c = segmentCurve(anchors, i);
  if (!c) return null;
  const at = (t: number) => {
    const s = 1 - t;
    return {
      x: s * s * s * c[0].x + 3 * s * s * t * c[1].x + 3 * s * t * t * c[2].x + t * t * t * c[3].x,
      y: s * s * s * c[0].y + 3 * s * s * t * c[1].y + 3 * s * t * t * c[2].y + t * t * t * c[3].y,
    };
  };
  const dist = (t: number) => len(sub(at(t), p));
  let best = 0;
  for (let k = 1; k <= 64; k++) if (dist(k / 64) < dist(best)) best = k / 64;
  let lo = Math.max(0, best - 1 / 64);
  let hi = Math.min(1, best + 1 / 64);
  for (let k = 0; k < 40; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(m1) < dist(m2)) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, d: dist(t) };
}
