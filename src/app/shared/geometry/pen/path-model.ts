import { parsePath, PathSeg } from '../path-data';
import { arcCenter } from '../sketch/svg-arc';
import { Subpath } from '../sketch/more-shapes';
import { Point } from '../view-transform';
import { curveAnchor, insertAnchor, nearestOnSegment } from './curvature';
import { PenAnchor, penPathData } from './pen-path';

/**
 * A whole path as subpaths of anchors (prompt 046): every command – lines, `H`/`V`, quadratics,
 * cubics, arcs (as cubics of at most 90° each) – so the path tools work on any `<path>`. Written
 * back with `M`/`L`/`C`/`Z`. Units of the path. Pure.
 */

export type { Subpath };

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** The cubics of an SVG arc segment (each ≤ 90°). */
function arcCubics(s: PathSeg): { c1: Point; c2: Point; p: Point }[] | null {
  const a = s.arc ? arcCenter(s.start, s.p, s.arc) : null;
  if (!a) return null;
  const n = Math.max(1, Math.ceil(Math.abs(a.delta) / (Math.PI / 2) - 1e-9));
  const step = a.delta / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const cos = Math.cos(a.phi);
  const sin = Math.sin(a.phi);
  const at = (t: number) => ({
    x: a.c.x + cos * a.rx * Math.cos(t) - sin * a.ry * Math.sin(t),
    y: a.c.y + sin * a.rx * Math.cos(t) + cos * a.ry * Math.sin(t),
  });
  const d = (t: number) => ({
    x: -cos * a.rx * Math.sin(t) - sin * a.ry * Math.cos(t),
    y: -sin * a.rx * Math.sin(t) + cos * a.ry * Math.cos(t),
  });
  const out: { c1: Point; c2: Point; p: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a.theta1 + step * i;
    const t1 = t0 + step;
    const p0 = at(t0);
    const p1 = i === n - 1 ? s.p : at(t1);
    const d0 = d(t0);
    const d1 = d(t1);
    out.push({
      c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y },
      p: p1,
    });
  }
  return out;
}

/** The subpaths of `d`; `null` when it does not parse. */
export function toSubpaths(d: string): Subpath[] | null {
  const segs = parsePath(d);
  if (!segs) return null;
  const out: Subpath[] = [];
  let cur: Subpath | null = null;
  const push = () => {
    if (!cur) return;
    // a closing point on the first: that point, with its incoming handle
    const a = cur.anchors;
    if (cur.closed && a.length > 2 && same(a[a.length - 1].p, a[0].p)) {
      a[0].hin = a[a.length - 1].hin ?? null;
      a.pop();
    }
    if (a.length) out.push(cur);
    cur = null;
  };
  for (const s of segs) {
    if (s.cmd === 'M') {
      push();
      cur = { anchors: [{ p: s.p, hin: null, hout: null }], closed: false };
      continue;
    }
    if (!cur) cur = { anchors: [{ p: s.start, hin: null, hout: null }], closed: false };
    const c: Subpath = cur;
    const last = () => c.anchors[c.anchors.length - 1];
    if (s.cmd === 'Z') {
      c.closed = true;
      push();
      continue;
    }
    if ((s.cmd === 'C' || s.cmd === 'S') && s.c1 && s.c2) {
      last().hout = s.c1;
      c.anchors.push({ p: s.p, hin: s.c2, hout: null });
    } else if ((s.cmd === 'Q' || s.cmd === 'T') && s.c1) {
      const q = s.c1;
      last().hout = {
        x: s.start.x + (2 / 3) * (q.x - s.start.x),
        y: s.start.y + (2 / 3) * (q.y - s.start.y),
      };
      c.anchors.push({
        p: s.p,
        hin: { x: s.p.x + (2 / 3) * (q.x - s.p.x), y: s.p.y + (2 / 3) * (q.y - s.p.y) },
        hout: null,
      });
    } else if (s.cmd === 'A') {
      const cubics = arcCubics(s);
      if (!cubics) c.anchors.push({ p: s.p, hin: null, hout: null });
      else {
        for (const k of cubics) {
          last().hout = k.c1;
          c.anchors.push({ p: k.p, hin: k.c2, hout: null });
        }
      }
    } else {
      c.anchors.push({ p: s.p, hin: null, hout: null });
    }
  }
  push();
  return out;
}

/** The path data of `subpaths`. */
export function fromSubpaths(subpaths: readonly Subpath[]): string {
  return subpaths
    .filter((s) => s.anchors.length)
    .map((s) => penPathData(s.anchors, s.closed))
    .join(' ');
}

export function mapSubpaths(subpaths: readonly Subpath[], f: (p: Point) => Point): Subpath[] {
  return subpaths.map((s) => ({
    closed: s.closed,
    anchors: s.anchors.map((a) => ({
      p: f(a.p),
      hin: a.hin ? f(a.hin) : null,
      hout: a.hout ? f(a.hout) : null,
    })),
  }));
}

/** The anchor nearest to `p` within `tol`. */
export function hitAnchor(subpaths: readonly Subpath[], p: Point, tol: number) {
  let best: { s: number; i: number; d: number } | null = null;
  subpaths.forEach((sp, s) =>
    sp.anchors.forEach((a, i) => {
      const d = Math.hypot(a.p.x - p.x, a.p.y - p.y);
      if (d <= tol && (!best || d < best.d)) best = { s, i, d };
    }),
  );
  return best as { s: number; i: number; d: number } | null;
}

/** The segment point nearest to `p` within `tol`: subpath, segment (from anchor `i`), `t`. */
export function hitSegment(subpaths: readonly Subpath[], p: Point, tol: number) {
  let best: { s: number; i: number; t: number; d: number } | null = null;
  subpaths.forEach((sp, s) => {
    const n = sp.closed ? sp.anchors.length : sp.anchors.length - 1;
    for (let i = 0; i < n; i++) {
      const hit = nearestOnSegment(sp.anchors, i, p);
      if (hit && hit.d <= tol && (!best || hit.d < best.d)) best = { s, i, ...hit };
    }
  });
  return best as { s: number; i: number; t: number; d: number } | null;
}

const replace = (subpaths: readonly Subpath[], s: number, sp: Subpath): Subpath[] =>
  subpaths.map((x, j) => (j === s ? sp : x));

/** A point added on segment `i` of subpath `s` at `t` without changing the shape. */
export function addAnchor(
  subpaths: readonly Subpath[],
  s: number,
  i: number,
  t: number,
): Subpath[] {
  const sp = subpaths[s];
  return replace(subpaths, s, { ...sp, anchors: insertAnchor(sp.anchors, i, t) });
}

/** Anchor `i` of subpath `s` removed (its neighbours meet with their own handles). */
export function removeAnchor(subpaths: readonly Subpath[], s: number, i: number): Subpath[] {
  const sp = subpaths[s];
  const anchors = sp.anchors.filter((_, j) => j !== i);
  if (anchors.length < 2) return subpaths.filter((_, j) => j !== s);
  return replace(subpaths, s, { anchors, closed: sp.closed && anchors.length > 2 });
}

/** Anchor `i` of subpath `s` made a corner, or smooth by the Curvature rule. */
export function convertAnchor(
  subpaths: readonly Subpath[],
  s: number,
  i: number,
  smooth: boolean,
): Subpath[] {
  const sp = subpaths[s];
  return replace(subpaths, s, { ...sp, anchors: curveAnchor(sp.anchors, i, sp.closed, smooth) });
}

/** Anchor `i` of subpath `s` with handles pulled to `to` (symmetric, like the pen). */
export function pullHandles(
  subpaths: readonly Subpath[],
  s: number,
  i: number,
  to: Point,
): Subpath[] {
  const sp = subpaths[s];
  const a = sp.anchors[i];
  const anchors = sp.anchors.map((x, j) =>
    j === i ? { p: a.p, hout: to, hin: { x: 2 * a.p.x - to.x, y: 2 * a.p.y - to.y } } : x,
  );
  return replace(subpaths, s, { ...sp, anchors });
}

/**
 * Cut at anchor `i` of subpath `s` (the Scissors): a closed subpath opens there (starting and
 * ending at the point), an open one splits in two; returns the subpaths that stay and the one
 * split off (an open path's second part becomes a path of its own).
 */
export function cutAt(
  subpaths: readonly Subpath[],
  s: number,
  i: number,
): { keep: Subpath[]; off: Subpath | null } {
  const sp = subpaths[s];
  const n = sp.anchors.length;
  if (sp.closed) {
    const rot = [...sp.anchors.slice(i), ...sp.anchors.slice(0, i)];
    const first = rot[0];
    const anchors: PenAnchor[] = [
      { p: first.p, hin: null, hout: first.hout ?? null },
      ...rot.slice(1),
      { p: first.p, hin: first.hin ?? null, hout: null },
    ];
    return { keep: replace(subpaths, s, { anchors, closed: false }), off: null };
  }
  if (i <= 0 || i >= n - 1) return { keep: [...subpaths], off: null };
  const a = sp.anchors[i];
  const head = {
    anchors: [...sp.anchors.slice(0, i), { p: a.p, hin: a.hin ?? null, hout: null }],
    closed: false,
  };
  const tail = {
    anchors: [{ p: a.p, hin: null, hout: a.hout ?? null }, ...sp.anchors.slice(i + 1)],
    closed: false,
  };
  return { keep: replace(subpaths, s, head), off: tail };
}

/**
 * Joins two open ends (the Join tool / Object › Join): the end `a` of subpath `sa` to the end `b`
 * of subpath `sb` with a straight segment, into one subpath; the same subpath's ends close it.
 */
export function joinEnds(
  subpaths: readonly Subpath[],
  sa: number,
  aEnd: 'start' | 'end',
  sb: number,
  bEnd: 'start' | 'end',
): Subpath[] {
  const A = subpaths[sa];
  const B = subpaths[sb];
  if (!A || !B || A.closed || B.closed) return [...subpaths];
  if (sa === sb) return replace(subpaths, sa, { ...A, closed: true });
  const rev = (x: PenAnchor[]) =>
    [...x].reverse().map((a) => ({ p: a.p, hin: a.hout ?? null, hout: a.hin ?? null }));
  const a = aEnd === 'end' ? A.anchors : rev(A.anchors);
  const b = bEnd === 'start' ? B.anchors : rev(B.anchors);
  // ends on the same spot become one point (the Scissors' cut joins back without a stub)
  const last = a[a.length - 1];
  const first = b[0];
  const same = Math.hypot(last.p.x - first.p.x, last.p.y - first.p.y) < 1e-6;
  const anchors = same
    ? [
        ...a.slice(0, -1),
        { p: last.p, hin: last.hin ?? null, hout: first.hout ?? null },
        ...b.slice(1),
      ]
    : [...a, ...b];
  const joined: Subpath = { anchors, closed: false };
  return subpaths.flatMap((x, j) => (j === sa ? [joined] : j === sb ? [] : [x]));
}

/** Distance of `p` from the polyline `stroke`. */
function strokeDistance(stroke: readonly Point[], p: Point): number {
  if (stroke.length === 1) return Math.hypot(stroke[0].x - p.x, stroke[0].y - p.y);
  let best = Infinity;
  for (let i = 0; i + 1 < stroke.length; i++) {
    const a = stroke[i];
    const b = stroke[i + 1];
    const d = { x: b.x - a.x, y: b.y - a.y };
    const l2 = d.x * d.x + d.y * d.y;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + d.x * k - p.x, a.y + d.y * k - p.y));
  }
  return best;
}

/** The anchors the brush `stroke` (radius `r`) touched made smooth by the Curvature rule (Smooth tool). */
export function smoothAlong(
  subpaths: readonly Subpath[],
  stroke: readonly Point[],
  r: number,
): Subpath[] {
  return subpaths.map((sp) => {
    let anchors = sp.anchors;
    sp.anchors.forEach((a, i) => {
      if (strokeDistance(stroke, a.p) <= r) anchors = curveAnchor(anchors, i, sp.closed, true);
    });
    return { ...sp, anchors };
  });
}

type Cubic = [Point, Point, Point, Point];
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function cubicAt(c: Cubic, t: number): Point {
  const s = 1 - t;
  return {
    x: s * s * s * c[0].x + 3 * s * s * t * c[1].x + 3 * s * t * t * c[2].x + t * t * t * c[3].x,
    y: s * s * s * c[0].y + 3 * s * s * t * c[1].y + 3 * s * t * t * c[2].y + t * t * t * c[3].y,
  };
}

/** The part of a cubic from `t0` to `t1` (de Casteljau twice). */
function subCubic(c: Cubic, t0: number, t1: number): Cubic {
  const split = (q: Cubic, t: number): [Cubic, Cubic] => {
    const a = lerp(q[0], q[1], t);
    const b = lerp(q[1], q[2], t);
    const d = lerp(q[2], q[3], t);
    const e = lerp(a, b, t);
    const f = lerp(b, d, t);
    const m = lerp(e, f, t);
    return [
      [q[0], a, e, m],
      [m, f, d, q[3]],
    ];
  };
  const right = split(c, t0)[1];
  return split(right, t0 < 1 ? (t1 - t0) / (1 - t0) : 0)[0];
}

/**
 * The Path Eraser: what the brush `stroke` (radius `r`) touched is cut away; the rest stays as open
 * subpaths (pieces of the segments, exact cubics). Sampled every 1/32 of a segment.
 */
export function eraseAlong(
  subpaths: readonly Subpath[],
  stroke: readonly Point[],
  r: number,
): Subpath[] {
  const N = 32;
  const out: Subpath[] = [];
  for (const sp of subpaths) {
    const n = sp.anchors.length;
    const segs = sp.closed ? n : n - 1;
    const kept: boolean[][] = [];
    const cubics: Cubic[] = [];
    for (let i = 0; i < segs; i++) {
      const a = sp.anchors[i];
      const b = sp.anchors[(i + 1) % n];
      const c: Cubic = [a.p, a.hout ?? a.p, b.hin ?? b.p, b.p];
      cubics.push(c);
      kept.push(
        Array.from({ length: N + 1 }, (_, k) => strokeDistance(stroke, cubicAt(c, k / N)) > r),
      );
    }
    if (kept.every((k) => k.every(Boolean))) {
      out.push(sp);
      continue;
    }
    const pieces: { anchors: PenAnchor[]; start0: boolean; endN: boolean }[] = [];
    let piece: (typeof pieces)[number] | null = null;
    cubics.forEach((c, i) => {
      const straight = !sp.anchors[i].hout && !sp.anchors[(i + 1) % n].hin;
      let k = 0;
      while (k <= N) {
        if (!kept[i][k]) {
          piece = null;
          k++;
          continue;
        }
        let e = k;
        while (e + 1 <= N && kept[i][e + 1]) e++;
        if (e > k) {
          const q = subCubic(c, k / N, e / N);
          // a run from the start of a segment goes on with the piece that reached its end
          if (!(piece && k === 0 && piece.endN)) {
            piece = {
              anchors: [{ p: q[0], hin: null, hout: null }],
              start0: i === 0 && k === 0,
              endN: false,
            };
            pieces.push(piece);
          }
          piece.anchors[piece.anchors.length - 1].hout = straight ? null : q[1];
          piece.anchors.push({ p: q[3], hin: straight ? null : q[2], hout: null });
          piece.endN = e === N;
        } else {
          piece = null;
        }
        if (e < N) piece = null;
        k = e + 1;
      }
    });
    // a closed subpath: its last piece runs on into its first
    if (sp.closed && pieces.length > 1 && pieces[0].start0 && pieces[pieces.length - 1].endN) {
      const last = pieces.pop()!;
      const first = pieces[0];
      first.anchors = [
        ...last.anchors.slice(0, -1),
        { ...last.anchors[last.anchors.length - 1], hout: first.anchors[0].hout },
        ...first.anchors.slice(1),
      ];
    }
    for (const x of pieces)
      if (x.anchors.length >= 2) out.push({ anchors: x.anchors, closed: false });
  }
  return out;
}
