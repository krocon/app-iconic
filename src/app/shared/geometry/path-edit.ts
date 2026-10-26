import { addPoints as add, PathSeg, subPoints as sub, withStarts } from './path-data';
import { Point } from './view-transform';

/**
 * Point editing of path data (design 007 E8; behaviour of the template's `SVGPathAnalyzer` and
 * `DocumentStore.insertPoint/removePoint`, Marc's own code, now for every command): anchors,
 * Bézier controls, segment midpoints; moving an anchor takes its attached controls along, inserting
 * splits a segment at t = 0.5 (de Casteljau), removing joins the neighbours. Pure: every function
 * returns new segments (`serializePath` writes them).
 */

export interface PathAnchor {
  /** Index in the anchor list (M points and every segment end except Z). */
  index: number;
  seg: number;
  p: Point;
}

export interface PathControl {
  seg: number;
  which: 'c1' | 'c2';
  p: Point;
  /** The anchor the control belongs to (drawn as a line). */
  anchor: Point;
}

export interface PathMidpoint {
  seg: number;
  p: Point;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const isLine = (s: PathSeg) => s.cmd === 'L' || s.cmd === 'H' || s.cmd === 'V';
const isCubic = (s: PathSeg) => s.cmd === 'C' || s.cmd === 'S';
const isQuad = (s: PathSeg) => s.cmd === 'Q' || s.cmd === 'T';
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

export function pathAnchors(segs: readonly PathSeg[]): PathAnchor[] {
  const out: PathAnchor[] = [];
  segs.forEach((s, seg) => {
    if (s.cmd !== 'Z') out.push({ index: out.length, seg, p: s.p });
  });
  return out;
}

/** Editable controls: both of C, the second of S (the first is implied), the one of Q. */
export function pathControls(segs: readonly PathSeg[]): PathControl[] {
  const out: PathControl[] = [];
  segs.forEach((s, seg) => {
    if (s.cmd === 'C' && s.c1) out.push({ seg, which: 'c1', p: s.c1, anchor: s.start });
    if ((s.cmd === 'C' || s.cmd === 'S') && s.c2)
      out.push({ seg, which: 'c2', p: s.c2, anchor: s.p });
    if (s.cmd === 'Q' && s.c1) out.push({ seg, which: 'c1', p: s.c1, anchor: s.p });
  });
  return out;
}

function cubicAt(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  const k = (p: number, q: number, r: number, s: number) =>
    u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s;
  return { x: k(a.x, b.x, c.x, d.x), y: k(a.y, b.y, c.y, d.y) };
}

function quadAt(a: Point, b: Point, c: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  };
}

/** Midpoints of the segments a point can be inserted into (lines, curves, a closing Z). */
export function pathMidpoints(segs: readonly PathSeg[]): PathMidpoint[] {
  const out: PathMidpoint[] = [];
  segs.forEach((s, seg) => {
    if (isLine(s) || (s.cmd === 'Z' && !same(s.start, s.p)))
      out.push({ seg, p: mid(s.start, s.p) });
    else if (isCubic(s)) out.push({ seg, p: cubicAt(s.start, s.c1!, s.c2!, s.p, 0.5) });
    else if (isQuad(s)) out.push({ seg, p: quadAt(s.start, s.c1!, s.p, 0.5) });
  });
  return out;
}

/** A new segment (no source text: always written). */
function fresh(base: PathSeg, cmd: PathSeg['cmd'], p: Point, c1?: Point, c2?: Point): PathSeg {
  return { cmd, rel: base.rel, implicit: false, start: base.start, p, c1, c2 };
}

/** Moves anchor `index` to `p`; the controls attached to it move along. */
export function moveAnchor(input: readonly PathSeg[], index: number, p: Point): PathSeg[] | null {
  const a = pathAnchors(input)[index];
  if (!a) return null;
  const segs = input.map((s) => ({ ...s }));
  const s = segs[a.seg];
  const d = sub(p, s.p);
  s.p = p;
  if (isCubic(s) && s.c2) s.c2 = add(s.c2, d);
  const next = segs[a.seg + 1];
  if (next && isCubic(next) && next.c1) next.c1 = add(next.c1, d);
  return withStarts(segs);
}

/** Moves a control point (`which` of segment `seg`). */
export function moveControl(
  input: readonly PathSeg[],
  seg: number,
  which: 'c1' | 'c2',
  p: Point,
): PathSeg[] | null {
  const s = input[seg];
  if (!s || !s[which]) return null;
  if (which === 'c1' && s.cmd !== 'C' && s.cmd !== 'Q') return null;
  const segs = input.map((x) => ({ ...x }));
  segs[seg][which] = p;
  return withStarts(segs);
}

/** Splits segment `seg` at t = 0.5; `null` for M and arcs. Returns the new anchor's index too. */
export function insertPoint(
  input: readonly PathSeg[],
  seg: number,
): { segs: PathSeg[]; anchor: number } | null {
  const segs = withStarts(input);
  const s = segs[seg];
  if (!s) return null;
  let parts: PathSeg[];
  if (isLine(s) || s.cmd === 'Z') {
    if (same(s.start, s.p)) return null;
    parts = [fresh(s, 'L', mid(s.start, s.p)), s];
  } else if (isCubic(s)) {
    const [a, b, c, d] = [s.start, s.c1!, s.c2!, s.p];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const cd = mid(c, d);
    const abc = mid(ab, bc);
    const bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    parts = [fresh(s, 'C', m, ab, abc), fresh(s, 'C', d, bcd, cd)];
  } else if (isQuad(s)) {
    const [a, b, c] = [s.start, s.c1!, s.p];
    const ab = mid(a, b);
    const bc = mid(b, c);
    parts = [fresh(s, 'Q', mid(ab, bc), ab), fresh(s, 'Q', c, bc)];
  } else {
    return null;
  }
  const out = withStarts([...segs.slice(0, seg), ...parts, ...segs.slice(seg + 1)]);
  const anchor = pathAnchors(out).find((x) => x.seg === seg)?.index ?? -1;
  return { segs: out, anchor };
}

/** Number of drawing segments (not M, not Z). */
const drawing = (segs: readonly PathSeg[]) =>
  segs.filter((s) => s.cmd !== 'M' && s.cmd !== 'Z').length;

/**
 * Removes anchor `index`: a start point (M) moves to the next anchor, inner points join their
 * neighbours (lines stay lines, curves become one C with the outer controls), `Z` stays.
 * `null` if the path would have nothing left to draw.
 */
export function removeAnchor(input: readonly PathSeg[], index: number): PathSeg[] | null {
  const a = pathAnchors(input)[index];
  if (!a) return null;
  const segs = withStarts(input).map((s) => ({ ...s }));
  const s = segs[a.seg];
  const next = segs[a.seg + 1];
  let out: PathSeg[];
  if (s.cmd === 'M') {
    if (!next || next.cmd === 'M' || next.cmd === 'Z') return null;
    out = [...segs.slice(0, a.seg), fresh(s, 'M', next.p), ...segs.slice(a.seg + 2)];
  } else if (!next || next.cmd === 'M' || next.cmd === 'Z' || next.cmd === 'A') {
    out = [...segs.slice(0, a.seg), ...segs.slice(a.seg + 1)];
  } else if (isLine(s) && isLine(next)) {
    out = [...segs.slice(0, a.seg), ...segs.slice(a.seg + 1)];
  } else {
    const c1 = isCubic(s) || isQuad(s) ? s.c1! : s.start;
    const c2 = isCubic(next) ? next.c2! : isQuad(next) ? next.c1! : next.p;
    out = [...segs.slice(0, a.seg), fresh(s, 'C', next.p, c1, c2), ...segs.slice(a.seg + 2)];
  }
  if (drawing(out) === 0) return null;
  return withStarts(out);
}
