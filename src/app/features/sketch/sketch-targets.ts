import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, applyLinear, fromDom, Matrix } from '../../shared/geometry/matrix';
import { PathSeg } from '../../shared/geometry/path-data';
import { Tangent } from '../../shared/geometry/sketch/apollonius';
import { dist, dot, sub, unit } from '../../shared/geometry/sketch/sketch-shapes';
import { Anchor } from '../../shared/geometry/sketch/sketch-tools';
import { arcCenter, arcTangentAt } from '../../shared/geometry/sketch/svg-arc';
import { Point } from '../../shared/geometry/view-transform';
import { readGeometry } from '../canvas/handles/node-geometry';
import { isRendered, paintedRoots } from '../canvas/hit-test';
import { ID_ATTR } from '../document/svg/node-ids';
import { similarity } from './sketch-elements';

/**
 * What the tangent tools can pick (design 019 E10): straight edges and circles of the painted
 * shapes, and the ends of open lines and arcs for the tangent arc – all in document units through
 * the browser's matrices. Collected once per step; the pure lookups pick the nearest.
 */

export interface SketchTarget {
  /** `asset:id:part` – the same edge is not picked twice. */
  key: string;
  tangent: Tangent;
  /** What the overlay highlights: the segment or the circle. */
  draw: { kind: 'segment'; a: Point; b: Point } | { kind: 'circle'; c: Point; r: number };
}

export interface SketchAnchor {
  key: string;
  anchor: Anchor;
}

export interface SketchTargets {
  targets: SketchTarget[];
  anchors: SketchAnchor[];
}

/** Most targets collected (huge imported icons). */
export const MAX_TARGETS = 20_000;

function segmentTarget(key: string, a: Point, b: Point): SketchTarget | null {
  const d = unit(sub(b, a));
  return d ? { key, tangent: { kind: 'line', p: a, d }, draw: { kind: 'segment', a, b } } : null;
}

const anchorAt = (key: string, p: Point, t: Point): SketchAnchor | null => {
  const u = unit(t);
  return u ? { key, anchor: { p, t: u } } : null;
};

/** Direction of travel at the start and at the end of a path segment (local units). */
function segmentDirections(s: PathSeg): { start: Point; end: Point } | null {
  const line = sub(s.p, s.start);
  switch (s.cmd) {
    case 'L':
    case 'H':
    case 'V':
    case 'Z':
      return { start: line, end: line };
    case 'C':
    case 'S': {
      const c1 = s.c1 ?? s.start;
      const c2 = s.c2 ?? s.p;
      const start = dist(c1, s.start) > 1e-9 ? sub(c1, s.start) : sub(c2, s.start);
      const end = dist(s.p, c2) > 1e-9 ? sub(s.p, c2) : sub(s.p, c1);
      return { start, end };
    }
    case 'Q':
    case 'T': {
      const c1 = s.c1 ?? s.start;
      return { start: sub(c1, s.start), end: sub(s.p, c1) };
    }
    case 'A': {
      const a = s.arc ? arcCenter(s.start, s.p, s.arc) : null;
      if (!a) return { start: line, end: line };
      return { start: arcTangentAt(a, a.theta1), end: arcTangentAt(a, a.theta1 + a.delta) };
    }
    default:
      return null;
  }
}

/** Targets and anchors of one element (local geometry mapped by `m`). */
function ofElement(el: Element, key: string, m: Matrix, out: SketchTargets): void {
  const g = readGeometry(el);
  const map = (p: Point) => apply(m, p);
  const dir = (v: Point) => applyLinear(m, v);
  const sim = similarity(m) ?? (m.a * m.d - m.b * m.c < 0 ? mirrored(m) : null);
  const push = (t: SketchTarget | null) => t && out.targets.push(t);
  const anchor = (a: SketchAnchor | null) => a && out.anchors.push(a);
  const circle = (i: string, c: Point, r: number) => {
    if (sim && r > 0) {
      const cc = map(c);
      const rr = r * sim.k;
      out.targets.push({
        key: `${key}:${i}`,
        tangent: { kind: 'circle', c: cc, r: rr },
        draw: { kind: 'circle', c: cc, r: rr },
      });
    }
  };
  switch (g.kind) {
    case 'line': {
      const a = map({ x: g.x1, y: g.y1 });
      const b = map({ x: g.x2, y: g.y2 });
      push(segmentTarget(`${key}:0`, a, b));
      anchor(anchorAt(`${key}:end`, b, sub(b, a)));
      anchor(anchorAt(`${key}:start`, a, sub(a, b)));
      break;
    }
    case 'rect': {
      const ps = [
        { x: g.x, y: g.y },
        { x: g.x + g.width, y: g.y },
        { x: g.x + g.width, y: g.y + g.height },
        { x: g.x, y: g.y + g.height },
      ].map(map);
      ps.forEach((p, i) => push(segmentTarget(`${key}:${i}`, p, ps[(i + 1) % 4])));
      break;
    }
    case 'poly': {
      const ps = g.points.map(map);
      const n = ps.length;
      for (let i = 0; i + 1 < n; i++) push(segmentTarget(`${key}:${i}`, ps[i], ps[i + 1]));
      if (g.closed && n > 2) push(segmentTarget(`${key}:${n - 1}`, ps[n - 1], ps[0]));
      if (!g.closed && n > 1) {
        anchor(anchorAt(`${key}:end`, ps[n - 1], sub(ps[n - 1], ps[n - 2])));
        anchor(anchorAt(`${key}:start`, ps[0], sub(ps[0], ps[1])));
      }
      break;
    }
    case 'circle':
      circle('c', { x: g.cx, y: g.cy }, g.r);
      break;
    case 'ellipse':
      if (Math.abs(g.rx - g.ry) <= 1e-9 * Math.max(g.rx, g.ry))
        circle('c', { x: g.cx, y: g.cy }, g.rx);
      break;
    case 'path': {
      let first: PathSeg | null = null;
      let last: PathSeg | null = null;
      const close = () => {
        if (first && last && last.cmd !== 'Z') {
          const s = segmentDirections(first);
          const e = segmentDirections(last);
          if (e) anchor(anchorAt(`${key}:e${out.anchors.length}`, map(last.p), dir(e.end)));
          if (s)
            anchor(
              anchorAt(
                `${key}:s${out.anchors.length}`,
                map(first.start),
                dir({ x: -s.start.x, y: -s.start.y }),
              ),
            );
        }
        first = last = null;
      };
      g.segs.forEach((s, i) => {
        if (s.cmd === 'M') {
          close();
          return;
        }
        first ??= s;
        last = s;
        if (s.cmd === 'L' || s.cmd === 'H' || s.cmd === 'V' || s.cmd === 'Z') {
          push(segmentTarget(`${key}:${i}`, map(s.start), map(s.p)));
        } else if (s.cmd === 'A' && s.arc) {
          const a = arcCenter(s.start, s.p, s.arc);
          if (a && Math.abs(a.rx - a.ry) <= 1e-9 * Math.max(a.rx, a.ry))
            circle(String(i), a.c, a.rx);
        }
      });
      close();
      break;
    }
  }
}

/** A mirroring similarity (circles stay circles). */
function mirrored(m: Matrix) {
  return similarity({ ...m, c: -m.c, d: -m.d });
}

/** Every target and anchor of the painted, visible shapes. */
export function collectSketchTargets(
  box: HTMLElement | null,
  host: SVGSVGElement | null,
): SketchTargets {
  const out: SketchTargets = { targets: [], anchors: [] };
  if (!box || !host) return out;
  for (const { asset, root } of paintedRoots(box)) {
    for (const el of root.querySelectorAll('*')) {
      if (out.targets.length >= MAX_TARGETS) return out;
      if (!(el instanceof SVGGraphicsElement) || el.children.length > 0) continue;
      const id = el.getAttribute(ID_ATTR);
      if (!id || !isRendered(el, root)) continue;
      const m = nodeToDocument(host, el);
      if (!m) continue;
      ofElement(el, `${asset}:${id}`, fromDom(m), out);
    }
  }
  return out;
}

/** Distance of `p` from what a target draws. */
export function targetDistance(t: SketchTarget, p: Point): number {
  if (t.draw.kind === 'circle') return Math.abs(dist(t.draw.c, p) - t.draw.r);
  const { a, b } = t.draw;
  const ab = sub(b, a);
  const k = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return dist(p, { x: a.x + ab.x * k, y: a.y + ab.y * k });
}

/** The nearest target within `tol` (document units) that is not in `taken`. */
export function nearestTarget(
  all: readonly SketchTarget[],
  p: Point,
  tol: number,
  taken: readonly string[] = [],
): SketchTarget | null {
  let best: SketchTarget | null = null;
  let bestD = tol;
  for (const t of all) {
    if (taken.includes(t.key)) continue;
    const d = targetDistance(t, p);
    if (d <= bestD) [best, bestD] = [t, d];
  }
  return best;
}

/** The nearest anchor within `tol` (document units). */
export function nearestAnchor(
  all: readonly SketchAnchor[],
  p: Point,
  tol: number,
): SketchAnchor | null {
  let best: SketchAnchor | null = null;
  let bestD = tol;
  for (const a of all) {
    const d = dist(a.anchor.p, p);
    if (d <= bestD) [best, bestD] = [a, d];
  }
  return best;
}
