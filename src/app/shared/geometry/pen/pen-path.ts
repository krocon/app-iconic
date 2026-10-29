import { fmt } from '../align';
import { parsePath, PathSeg } from '../path-data';
import { Point } from '../view-transform';

/**
 * The path of the pen (prompt 042; behaviour of Marc's VectorCraft `crates/tools/src/pen.rs`):
 * anchors with optional handles, written as `M`/`L`/`C` (`Z` when closed). Document units. Pure.
 */

export interface PenAnchor {
  p: Point;
  /** Incoming handle (absolute), `null` = none (a corner on that side). */
  hin?: Point | null;
  /** Outgoing handle (absolute). */
  hout?: Point | null;
}

const pt = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** One segment from `a` to `b`: a line without handles, else a cubic. */
function segment(a: PenAnchor, b: PenAnchor): string {
  const c1 = a.hout && !same(a.hout, a.p) ? a.hout : null;
  const c2 = b.hin && !same(b.hin, b.p) ? b.hin : null;
  if (!c1 && !c2) return `L ${pt(b.p)}`;
  return `C ${pt(c1 ?? a.p)} ${pt(c2 ?? b.p)} ${pt(b.p)}`;
}

/** The path data of `anchors` (`''` for none). */
export function penPathData(anchors: readonly PenAnchor[], closed: boolean): string {
  if (!anchors.length) return '';
  const parts = [`M ${pt(anchors[0].p)}`];
  for (let i = 1; i < anchors.length; i++) parts.push(segment(anchors[i - 1], anchors[i]));
  if (closed && anchors.length > 1) {
    const last = anchors[anchors.length - 1];
    const first = anchors[0];
    if (last.hout || first.hin) parts.push(segment(last, first));
    parts.push('Z');
  }
  return parts.join(' ');
}

/** Every point of the anchors mapped by `f` (an affine map keeps Bézier curves). */
export function mapAnchors(anchors: readonly PenAnchor[], f: (p: Point) => Point): PenAnchor[] {
  return anchors.map((a) => ({
    p: f(a.p),
    hin: a.hin ? f(a.hin) : (a.hin ?? null),
    hout: a.hout ? f(a.hout) : (a.hout ?? null),
  }));
}

/** `p` turned about `from` to the nearest 45° step, its distance kept (Shift). */
export function constrain45(from: Point, p: Point): Point {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const len = Math.hypot(dx, dy);
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const r = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { x: from.x + r(len * Math.cos(a)), y: from.y + r(len * Math.sin(a)) };
}

/**
 * The handles of an anchor dragged out to `to`: the outgoing one there, the incoming one opposite
 * (symmetric) – with `keepIn` (Alt) the incoming one stays as it was.
 */
export function dragHandles(a: PenAnchor, to: Point, keepIn: boolean): PenAnchor {
  return {
    p: a.p,
    hout: to,
    hin: keepIn ? (a.hin ?? null) : { x: 2 * a.p.x - to.x, y: 2 * a.p.y - to.y },
  };
}

/** The anchors reversed (incoming and outgoing handles swap). */
export function reverseAnchors(anchors: readonly PenAnchor[]): PenAnchor[] {
  return [...anchors].reverse().map((a) => ({ p: a.p, hin: a.hout ?? null, hout: a.hin ?? null }));
}

/**
 * The last subpath of `d` as anchors, if it is open and made of lines and curves (`M L H V C S Q
 * T`; a quadratic becomes the same cubic), with the text before it kept as it is; `null` else.
 */
export function openTail(d: string): { prefix: string; anchors: PenAnchor[] } | null {
  const segs = parsePath(d);
  if (!segs || !segs.length) return null;
  let m = -1;
  segs.forEach((s, i) => s.cmd === 'M' && (m = i));
  if (m < 0) return null;
  const tail = segs.slice(m);
  if (tail.some((s) => s.cmd === 'Z' || s.cmd === 'A')) return null;
  const anchors: PenAnchor[] = [{ p: tail[0].p, hin: null, hout: null }];
  for (const s of tail.slice(1)) {
    const prev = anchors[anchors.length - 1];
    const cubic = toCubic(s);
    if (cubic) {
      prev.hout = cubic.c1;
      anchors.push({ p: s.p, hin: cubic.c2, hout: null });
    } else {
      anchors.push({ p: s.p, hin: null, hout: null });
    }
  }
  if (anchors.length < 2) return null;
  const prefix = segs
    .slice(0, m)
    .map((s) => s.raw ?? '')
    .join('');
  if (segs.slice(0, m).some((s) => s.raw === undefined)) return null;
  return { prefix, anchors };
}

function toCubic(s: PathSeg): { c1: Point; c2: Point } | null {
  if ((s.cmd === 'C' || s.cmd === 'S') && s.c1 && s.c2) return { c1: s.c1, c2: s.c2 };
  if ((s.cmd === 'Q' || s.cmd === 'T') && s.c1) {
    const q = s.c1;
    return {
      c1: {
        x: s.start.x + (2 / 3) * (q.x - s.start.x),
        y: s.start.y + (2 / 3) * (q.y - s.start.y),
      },
      c2: { x: s.p.x + (2 / 3) * (q.x - s.p.x), y: s.p.y + (2 / 3) * (q.y - s.p.y) },
    };
  }
  return null;
}

/**
 * A path of one subpath as anchors (open or closed, lines and curves; a quadratic becomes the
 * same cubic) – what the Curvature tool edits (prompt 043); `null` for anything else.
 */
export function singlePath(d: string): { anchors: PenAnchor[]; closed: boolean } | null {
  const segs = parsePath(d);
  if (!segs || !segs.length || segs[0].cmd !== 'M') return null;
  if (segs.slice(1).some((s) => s.cmd === 'M' || s.cmd === 'A')) return null;
  const z = segs.findIndex((s) => s.cmd === 'Z');
  if (z >= 0 && z !== segs.length - 1) return null;
  const closed = z >= 0;
  const anchors: PenAnchor[] = [{ p: segs[0].p, hin: null, hout: null }];
  for (const s of segs.slice(1, closed ? -1 : undefined)) {
    const prev = anchors[anchors.length - 1];
    const cubic = toCubic(s);
    if (cubic) prev.hout = cubic.c1;
    anchors.push({ p: s.p, hin: cubic ? cubic.c2 : null, hout: null });
  }
  // a closing segment that ends on the first point: that point, with its incoming handle
  const last = anchors[anchors.length - 1];
  if (closed && anchors.length > 2 && same(last.p, anchors[0].p)) {
    anchors[0].hin = last.hin ?? null;
    anchors.pop();
  }
  return anchors.length >= 2 ? { anchors, closed } : null;
}
