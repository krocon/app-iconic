// Verfahren nach Marcs VectorCraft, crates/pathops/src/offset.rs (MIT/Apache): Versatz = Fläche ∪ / −
// Strichfläche der doppelten Breite; Prompt 052.
import { PaperScope } from './boolean-ops';

/**
 * Offset Path and Outline Stroke (prompt 052): the area a stroke paints, built from one band per
 * segment (lines exactly, Béziers by Tiller–Hanson offsets refined until within `TOL`), joins and
 * caps, united with paper.js – so the result keeps curves. Offset = the fill grown by (∪) or shrunk
 * by (−) a stroke of twice the distance, like VectorCraft. Path data in one space.
 */

type PPath = paper.Path;
type Item = paper.PathItem;
type Pt = paper.Point;

export type LineJoin = 'miter' | 'round' | 'bevel';
export type LineCap = 'butt' | 'round' | 'square';

export interface StrokeStyle {
  width: number;
  join: LineJoin;
  cap: LineCap;
  miterLimit: number;
}

/** How far an approximated offset curve may stray (document units). */
export const TOL = 0.02;
const MAX_DEPTH = 8;

const empty = (scope: PaperScope): Item => new scope.CompoundPath({ insert: false });

/** Unites many shapes pairwise (a balanced tree is much faster than one after another). */
function uniteAll(scope: PaperScope, items: Item[]): Item {
  let list = items.filter((i) => !i.isEmpty());
  if (!list.length) return empty(scope);
  while (list.length > 1) {
    const next: Item[] = [];
    for (let i = 0; i < list.length; i += 2) {
      next.push(i + 1 < list.length ? list[i].unite(list[i + 1], { insert: false }) : list[i]);
    }
    list = next;
  }
  return list[0];
}

function polygon(scope: PaperScope, pts: Pt[]): PPath {
  return new scope.Path({ segments: pts, closed: true, insert: false });
}

/** The offset of a cubic by `h` (left of the direction) as cubics within `TOL`. */
function offsetCubic(scope: PaperScope, c: paper.Curve, h: number, depth = 0): paper.Segment[][] {
  const p0 = c.point1;
  const p1 = c.point1.add(c.handle1);
  const p2 = c.point2.add(c.handle2);
  const p3 = c.point2;
  const n = (t: number) => {
    const tan = c.getTangentAtTime(t);
    return tan ? new scope.Point(-tan.y, tan.x).normalize(h) : new scope.Point(0, 0);
  };
  const q0 = p0.add(n(0));
  const q3 = p3.add(n(1));
  // Tiller–Hanson: the offset control polygon, its middle leg cut with the outer ones
  const leg = (a: Pt, b: Pt) => {
    const d = b.subtract(a);
    return d.length > 1e-9 ? new scope.Point(-d.y, d.x).normalize(h) : null;
  };
  const meet = (a: Pt, da: Pt, b: Pt, db: Pt): Pt | null => {
    const det = da.x * db.y - da.y * db.x;
    if (Math.abs(det) < 1e-12) return null;
    const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / det;
    return a.add(da.multiply(t));
  };
  const n01 = leg(p0, p1) ?? n(0);
  const n12 = leg(p1, p2);
  const n23 = leg(p2, p3) ?? n(1);
  let q1 = p1.add(n01);
  let q2 = p2.add(n23);
  if (n12) {
    const a = p1.add(n12);
    q1 = meet(p0.add(n01), p1.subtract(p0), a, p2.subtract(p1)) ?? q1;
    q2 = meet(p3.add(n23), p2.subtract(p3), a, p2.subtract(p1)) ?? q2;
  }
  const approx = new scope.Curve(q0, q1.subtract(q0), q2.subtract(q3), q3);
  let ok = true;
  for (const t of [0.2, 0.4, 0.5, 0.6, 0.8]) {
    const want = c.getPointAtTime(t).add(n(t));
    if (approx.getNearestPoint(want).getDistance(want) > TOL) {
      ok = false;
      break;
    }
  }
  if (ok || depth >= MAX_DEPTH) {
    return [
      [
        new scope.Segment(q0, undefined, q1.subtract(q0)),
        new scope.Segment(q3, q2.subtract(q3), undefined),
      ],
    ];
  }
  const parts = c.clone().divideAtTime(0.5);
  const first = c.clone();
  first.divideAtTime(0.5);
  return [...offsetCubic(scope, first, h, depth + 1), ...offsetCubic(scope, parts, h, depth + 1)];
}

/** The band a stroke of half width `h` paints along one curve: left side out, right side back. */
function band(scope: PaperScope, c: paper.Curve, h: number): PPath | null {
  if (c.length < 1e-9) return null;
  if (c.isStraight()) {
    const d = c.point2.subtract(c.point1);
    const n = new scope.Point(-d.y, d.x).normalize(h);
    // a hair longer: bands overlap at the vertices instead of touching (paper.js unites
    // overlapping shapes more reliably than ones that share an edge)
    const e = d.normalize(Math.min(1e-3, d.length / 4));
    const a = c.point1.subtract(e);
    const b = c.point2.add(e);
    return polygon(scope, [a.add(n), b.add(n), b.subtract(n), a.subtract(n)]);
  }
  const left = offsetCubic(scope, c, h).flat();
  const right = offsetCubic(scope, c, -h).flat();
  const path = new scope.Path({ insert: false });
  const add = (segs: paper.Segment[]) => {
    for (let i = 0; i < segs.length; i += 2) {
      const a = segs[i];
      const b = segs[i + 1];
      const last = path.lastSegment;
      if (last && last.point.getDistance(a.point) < 1e-9) last.handleOut = a.handleOut;
      else path.add(a.clone());
      path.add(b.clone());
    }
  };
  add(left);
  // the right side backwards
  const back: paper.Segment[] = [];
  for (let i = right.length - 2; i >= 0; i -= 2) {
    const a = right[i];
    const b = right[i + 1];
    back.push(
      new scope.Segment(b.point, undefined, b.handleIn),
      new scope.Segment(a.point, a.handleOut, undefined),
    );
  }
  add(back);
  path.closed = true;
  return path;
}

/** The piece at a vertex where `t1` (in) meets `t2` (out). */
function joinAt(scope: PaperScope, v: Pt, t1: Pt, t2: Pt, h: number, s: StrokeStyle): PPath | null {
  const cross = t1.x * t2.y - t1.y * t2.x;
  if (Math.abs(cross) < 1e-9 && t1.dot(t2) > 0) return null;
  if (s.join === 'round') return new scope.Path.Circle({ center: v, radius: h, insert: false });
  // the outer side: where the turn opens
  const side = cross > 0 ? -1 : 1;
  const n1 = new scope.Point(-t1.y, t1.x).normalize(h * side);
  const n2 = new scope.Point(-t2.y, t2.x).normalize(h * side);
  const a = v.add(n1);
  const b = v.add(n2);
  // the inner corner of the piece reaches into the bands (no edge shared with them)
  const inner = v.subtract(n1.add(n2).normalize(h / 2));
  if (s.join === 'miter') {
    // the turn φ between the directions: the tip lies h / cos(φ/2) out; SVG's miter ratio is the same
    const cosHalf = Math.sqrt(Math.max(0, (1 + t1.dot(t2)) / 2));
    const ratio = 1 / Math.max(cosHalf, 1e-9);
    if (ratio <= s.miterLimit) {
      const tip = v.add(n1.add(n2).normalize(h * ratio));
      return polygon(scope, [inner, a, tip, b]);
    }
  }
  return polygon(scope, [inner, a, b]);
}

/** The cap at an open end `p` with direction `t` pointing out of the path. */
function capAt(scope: PaperScope, p: Pt, t: Pt, h: number, cap: LineCap): PPath | null {
  if (cap === 'butt') return null;
  if (cap === 'round') return new scope.Path.Circle({ center: p, radius: h, insert: false });
  const n = new scope.Point(-t.y, t.x).normalize(h);
  const f = t.normalize(h);
  return polygon(scope, [p.add(n), p.add(n).add(f), p.subtract(n).add(f), p.subtract(n)]);
}

function children(scope: PaperScope, d: string): PPath[] {
  const c = new scope.CompoundPath({ pathData: d, insert: false });
  return [...(c.children as PPath[])].filter((p) => p.segments.length > 1 || p.closed);
}

/** Drops the hair-thin steps the overlapping pieces leave (points closer than this). */
const HAIR = 0.01;

function tidy(item: Item): string {
  const paths = item.className === 'CompoundPath' ? (item.children as PPath[]) : [item as PPath];
  for (const p of paths) {
    for (let i = p.segments.length - 1; i > 0; i--) {
      const s = p.segments[i];
      const prev = p.segments[i - 1];
      if (
        s.point.getDistance(prev.point) < HAIR &&
        s.handleIn.isZero() &&
        prev.handleOut.isZero()
      ) {
        prev.handleOut = s.handleOut;
        s.remove();
      }
    }
    // straight runs of several points become one line
    for (let i = p.segments.length - 2; i > 0; i--) {
      const [a, b, c] = [p.segments[i - 1], p.segments[i], p.segments[i + 1]];
      const straight =
        a.handleOut.isZero() && b.handleIn.isZero() && b.handleOut.isZero() && c.handleIn.isZero();
      const u = b.point.subtract(a.point);
      const v = c.point.subtract(b.point);
      if (straight && Math.abs(u.cross(v)) < 1e-6 * (u.length * v.length + 1e-12) && u.dot(v) > 0) {
        b.remove();
      }
    }
  }
  return item.pathData;
}

/** The area stroking `d` with `style` paints (path data; `''` = nothing). */
export function strokeArea(scope: PaperScope, d: string, style: StrokeStyle): string {
  return tidy(strokeItem(scope, children(scope, d), style));
}

function strokeItem(scope: PaperScope, paths: PPath[], s: StrokeStyle): Item {
  const h = s.width / 2;
  if (!(h > 0)) return empty(scope);
  const pieces: Item[] = [];
  for (const path of paths) {
    const curves = path.curves.filter((c) => c.length > 1e-9);
    for (const c of curves) {
      const b = band(scope, c, h);
      if (b) pieces.push(b);
    }
    for (let i = 0; i < curves.length; i++) {
      const next = curves[i + 1] ?? (path.closed ? curves[0] : null);
      if (!next) continue;
      const j = joinAt(
        scope,
        curves[i].point2,
        curves[i].getTangentAtTime(1).normalize(),
        next.getTangentAtTime(0).normalize(),
        h,
        s,
      );
      if (j) pieces.push(j);
    }
    if (!path.closed && curves.length) {
      const a = capAt(
        scope,
        curves[0].point1,
        curves[0].getTangentAtTime(0).multiply(-1).normalize(),
        h,
        s.cap,
      );
      const last = curves[curves.length - 1];
      const b = capAt(scope, last.point2, last.getTangentAtTime(1).normalize(), h, s.cap);
      if (a) pieces.push(a);
      if (b) pieces.push(b);
    }
  }
  return uniteAll(scope, pieces);
}

/**
 * Offset Path: closed subpaths as a filled area grown (`delta` > 0) or shrunk (< 0) by `|delta|`,
 * open subpaths outlined with `2|delta|` (butt caps). `evenOdd` = the fill rule of the area.
 */
export function offsetPath(
  scope: PaperScope,
  d: string,
  delta: number,
  join: LineJoin = 'round',
  miterLimit = 4,
  evenOdd = false,
): string {
  const all = children(scope, d);
  const closed = all.filter((p) => p.closed);
  const open = all.filter((p) => !p.closed);
  const fill = new scope.CompoundPath({
    children: closed.map((p) => p.clone({ insert: false })),
    insert: false,
  });
  fill.fillRule = evenOdd ? 'evenodd' : 'nonzero';
  const area = closed.length ? fill.unite(fill, { insert: false }) : empty(scope);
  const w = 2 * Math.abs(delta);
  if (!(w > 0)) return tidy(area);
  const ring = strokeItem(scope, closed, { width: w, join, cap: 'butt', miterLimit });
  const lines = strokeItem(scope, open, { width: w, join, cap: 'butt', miterLimit });
  const out =
    delta > 0 ? uniteAll(scope, [area, ring, lines]) : area.subtract(ring, { insert: false });
  return tidy(out);
}
