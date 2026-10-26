import { fmt } from './align';
import { Point } from './view-transform';

/**
 * Path data `d` split into segments and put together again (design 007 E8). The browser has no
 * path-data API (`getPathData` is missing in Chromium and WebKit), so this is a small tokenizer –
 * no renderer, no geometry evaluation. Every segment keeps its source text, whether it was
 * relative and whether it was implicit (numbers without a letter), and its ABSOLUTE points.
 * `serializePath` writes unchanged segments character for character and only re-writes segments
 * whose points (or, if relative, start point, or the implied S/T reflection) changed – keeping
 * their relative / absolute form. Pure.
 */

export type PathCmd = 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z';

export interface ArcParams {
  rx: number;
  ry: number;
  rot: number;
  large: number;
  sweep: number;
}

export interface PathSeg {
  cmd: PathCmd;
  rel: boolean;
  /** Numbers without a letter (repetition of the previous command). */
  implicit: boolean;
  /** Source text (leading separators included); `undefined` = new segment, always written. */
  raw?: string;
  /** Current point before the segment (absolute; kept up to date by `withStarts`). */
  start: Point;
  /** End point (absolute). `Z`: the start of the subpath. */
  p: Point;
  /** Controls (absolute). S: `c1` is the reflection; T: `c1` is the reflected control. */
  c1?: Point;
  c2?: Point;
  arc?: ArcParams;
  /** The values when parsed (to tell what changed). */
  orig?: { cmd: PathCmd; start: Point; p: Point; c1?: Point; c2?: Point };
}

const ARITY: Record<PathCmd, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
const SEPS = /[\s,]/;

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const reflect = (p: Point, about: Point): Point => ({
  x: 2 * about.x - p.x,
  y: 2 * about.y - p.y,
});
const close = (a: Point | undefined, b: Point | undefined, eps = 1e-6) =>
  (!a && !b) || (!!a && !!b && Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps);

/** The implied first control of S (after C/S) or control of T (after Q/T). */
export function implied(prev: PathSeg | undefined, seg: PathSeg): Point {
  if (seg.cmd === 'S' && prev && (prev.cmd === 'C' || prev.cmd === 'S') && prev.c2) {
    return reflect(prev.c2, seg.start);
  }
  if (seg.cmd === 'T' && prev && (prev.cmd === 'Q' || prev.cmd === 'T') && prev.c1) {
    return reflect(prev.c1, seg.start);
  }
  return seg.start;
}

/** Splits `d`; `null` if it is not valid path data (nothing is edited then). */
export function parsePath(d: string): PathSeg[] | null {
  const segs: PathSeg[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && SEPS.test(d[i])) i++;
  };
  const num = (): number | null => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return null;
    i = NUM.lastIndex;
    return Number(m[0]);
  };
  const flag = (): number | null => {
    skip();
    if (d[i] === '0' || d[i] === '1') return Number(d[i++]);
    return null;
  };
  let cur: Point = { x: 0, y: 0 };
  let subStart: Point = { x: 0, y: 0 };
  let last: { cmd: PathCmd; rel: boolean } | null = null;
  for (;;) {
    const s = i;
    skip();
    if (i >= d.length) {
      if (segs.length && i > s) segs[segs.length - 1].raw += d.slice(s);
      break;
    }
    let cmd: PathCmd;
    let rel: boolean;
    let implicit = false;
    const ch = d[i];
    if (/[MLHVCSQTAZ]/i.test(ch)) {
      cmd = ch.toUpperCase() as PathCmd;
      rel = ch !== cmd;
      i++;
    } else if (last && last.cmd !== 'Z') {
      cmd = last.cmd === 'M' ? 'L' : last.cmd;
      rel = last.rel;
      implicit = true;
    } else {
      return null;
    }
    if (segs.length === 0 && cmd !== 'M') return null;
    const v: number[] = [];
    for (let k = 0; k < ARITY[cmd]; k++) {
      const x = cmd === 'A' && (k === 3 || k === 4) ? flag() : num();
      if (x === null) return null;
      v.push(x);
    }
    const o = rel ? cur : { x: 0, y: 0 };
    const pt = (k: number): Point => ({ x: o.x + v[k], y: o.y + v[k + 1] });
    const seg: PathSeg = { cmd, rel, implicit, start: cur, p: cur };
    switch (cmd) {
      case 'M':
        seg.p = pt(0);
        subStart = seg.p;
        break;
      case 'L':
      case 'T':
        seg.p = pt(0);
        break;
      case 'H':
        seg.p = { x: (rel ? cur.x : 0) + v[0], y: cur.y };
        break;
      case 'V':
        seg.p = { x: cur.x, y: (rel ? cur.y : 0) + v[0] };
        break;
      case 'C':
        seg.c1 = pt(0);
        seg.c2 = pt(2);
        seg.p = pt(4);
        break;
      case 'S':
        seg.c2 = pt(0);
        seg.p = pt(2);
        break;
      case 'Q':
        seg.c1 = pt(0);
        seg.p = pt(2);
        break;
      case 'A':
        seg.arc = { rx: v[0], ry: v[1], rot: v[2], large: v[3], sweep: v[4] };
        seg.p = pt(5);
        break;
      case 'Z':
        seg.p = subStart;
        break;
    }
    if (cmd === 'S' || cmd === 'T') seg.c1 = implied(segs.at(-1), seg);
    seg.raw = d.slice(s, i);
    seg.orig = { cmd, start: seg.start, p: seg.p, c1: seg.c1, c2: seg.c2 };
    segs.push(seg);
    cur = seg.p;
    last = { cmd, rel };
  }
  return segs.length ? segs : null;
}

/** Recomputes the start points (and the end of `Z`) after an edit. */
export function withStarts(segs: readonly PathSeg[]): PathSeg[] {
  let cur: Point = { x: 0, y: 0 };
  let subStart = cur;
  return segs.map((s) => {
    const seg = { ...s, start: cur };
    if (seg.cmd === 'M') subStart = seg.p;
    if (seg.cmd === 'Z') seg.p = subStart;
    cur = seg.p;
    return seg;
  });
}

function changed(seg: PathSeg, prev: PathSeg | undefined): boolean {
  const o = seg.orig;
  if (seg.raw === undefined || !o || o.cmd !== seg.cmd) return true;
  if (!close(o.p, seg.p) || !close(o.c1, seg.c1) || !close(o.c2, seg.c2)) return true;
  if (seg.rel && !close(o.start, seg.start)) return true;
  if ((seg.cmd === 'S' || seg.cmd === 'T') && !close(implied(prev, seg), seg.c1)) return true;
  return false;
}

const letter = (cmd: PathCmd, rel: boolean) => (rel ? cmd.toLowerCase() : cmd);
/** The command numbers without a letter continue (after M: L). */
const follower = (l: string) => (l === 'M' ? 'L' : l === 'm' ? 'l' : l);

/** A segment written anew (its relative / absolute form kept). */
function emit(seg: PathSeg, prev: PathSeg | undefined): string {
  const r = seg.rel;
  const pts = (...ps: Point[]) =>
    ps.map((q) => (r ? sub(q, seg.start) : q)).flatMap((q) => [fmt(q.x), fmt(q.y)]);
  const out = (cmd: PathCmd, nums: string[]) => `${letter(cmd, r)}${nums.join(' ')}`;
  switch (seg.cmd) {
    case 'Z':
      return letter('Z', r);
    case 'M':
      return out('M', pts(seg.p));
    case 'H':
      if (Math.abs(seg.p.y - seg.start.y) < 1e-6) {
        return out('H', [fmt(r ? seg.p.x - seg.start.x : seg.p.x)]);
      }
      return out('L', pts(seg.p));
    case 'V':
      if (Math.abs(seg.p.x - seg.start.x) < 1e-6) {
        return out('V', [fmt(r ? seg.p.y - seg.start.y : seg.p.y)]);
      }
      return out('L', pts(seg.p));
    case 'L':
      return out('L', pts(seg.p));
    case 'C':
      return out('C', pts(seg.c1!, seg.c2!, seg.p));
    case 'S':
      return close(implied(prev, seg), seg.c1)
        ? out('S', pts(seg.c2!, seg.p))
        : out('C', pts(seg.c1!, seg.c2!, seg.p));
    case 'Q':
      return out('Q', pts(seg.c1!, seg.p));
    case 'T':
      return close(implied(prev, seg), seg.c1)
        ? out('T', pts(seg.p))
        : out('Q', pts(seg.c1!, seg.p));
    case 'A': {
      const a = seg.arc!;
      return out('A', [
        fmt(a.rx),
        fmt(a.ry),
        fmt(a.rot),
        String(a.large),
        String(a.sweep),
        ...pts(seg.p),
      ]);
    }
  }
}

/** Puts `d` together: unchanged segments as they were, changed ones written anew. */
export function serializePath(input: readonly PathSeg[]): string {
  const segs = withStarts(input);
  let out = '';
  let lastLetter = '';
  segs.forEach((seg, i) => {
    const prev = segs[i - 1];
    if (!changed(seg, prev)) {
      let raw = seg.raw!;
      const own = letter(seg.cmd, seg.rel);
      if (seg.implicit && follower(lastLetter) !== own) {
        raw = ` ${own}${raw.replace(/^[\s,]+/, '')}`;
      }
      out += raw;
      lastLetter = seg.implicit && follower(lastLetter) === own ? lastLetter : own;
      return;
    }
    const text = emit(seg, prev);
    out += (out && !/[\s,]$/.test(out) ? ' ' : '') + text;
    lastLetter = text[0];
  });
  return out;
}

export { add as addPoints, sub as subPoints };
