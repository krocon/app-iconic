import { nearestOn, Outline, outlineBounds } from './sketch/intersections';
import { Point } from './view-transform';

/**
 * The Smart Guides beyond marked points (prompt 040; like Marc's VectorCraft,
 * `crates/tools/src/guides/targets.rs` `snap_from`): a point drawn from `from` lands where its
 * line touches a circle (tangent) or meets an edge square (perpendicular); else on an outline
 * (path); else on a construction guide through `from` (0°/45°/90°/135° …) or on the extension of
 * a straight segment, sliding into line with a marked point nearby. Document units. Pure.
 */

export type GuideTag = 'tangent' | 'perpendicular' | 'path';

export interface SmartScene {
  outlines: readonly Outline[];
  /** The point the drawn one leaves (the last placed point). */
  from?: Point | null;
  /** Construction guide angles in degrees (counter-clockwise; each also the opposite way). */
  angles?: readonly number[];
  /** Lines a dragged point keeps to: the extensions of straight segments (fixed end, direction). */
  extensions?: readonly { at: Point; dir: Point }[];
}

export interface SmartHit {
  point: Point;
  tag?: GuideTag;
  guides: { from: Point; to: Point }[];
  /** How far it moved (document units). */
  distance: number;
}

/** VectorCraft's default construction angles: every 45°. */
export const DEFAULT_CONSTRUCTION_ANGLES: readonly number[] = [0, 45, 90, 135];

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where the lines from `from` touch the outlines (tangent) or meet edges square (perpendicular). */
export function touchPoints(
  from: Point,
  outlines: readonly Outline[],
): { point: Point; tag: 'tangent' | 'perpendicular' }[] {
  const out: { point: Point; tag: 'tangent' | 'perpendicular' }[] = [];
  for (const o of outlines) {
    if (o.kind === 'circle') {
      const d = dist(from, o.c);
      if (!(d > o.r + 1e-9)) continue;
      const base = Math.atan2(from.y - o.c.y, from.x - o.c.x);
      const off = Math.acos(o.r / d);
      for (const a of [base + off, base - off]) {
        out.push({
          point: { x: o.c.x + o.r * Math.cos(a), y: o.c.y + o.r * Math.sin(a) },
          tag: 'tangent',
        });
      }
    } else if (o.kind === 'segment') {
      const d = { x: o.b.x - o.a.x, y: o.b.y - o.a.y };
      const l2 = d.x * d.x + d.y * d.y;
      if (l2 <= 1e-18) continue;
      const k = ((from.x - o.a.x) * d.x + (from.y - o.a.y) * d.y) / l2;
      if (k <= 1e-9 || k >= 1 - 1e-9) continue;
      const q = { x: o.a.x + d.x * k, y: o.a.y + d.y * k };
      if (dist(q, from) > 1e-9) out.push({ point: q, tag: 'perpendicular' });
    }
  }
  return out;
}

/**
 * The nearest Smart Guide hit for `p` within `tol` (document units); `lines` are the marked points
 * whose x / y a construction guide slides to (within `slideTol`).
 */
export function smartSnap(
  p: Point,
  scene: SmartScene,
  tol: number,
  lines: readonly Point[] = [],
  slideTol = tol,
): SmartHit | null {
  const from = scene.from ?? null;
  // tangent / perpendicular
  if (from && dist(from, p) > tol) {
    let best: SmartHit | null = null;
    for (const t of touchPoints(from, scene.outlines)) {
      const d = dist(t.point, p);
      if (d <= tol && (!best || d < best.distance)) {
        best = { point: t.point, tag: t.tag, guides: [{ from, to: t.point }], distance: d };
      }
    }
    if (best) return best;
  }
  // on an outline
  let path: SmartHit | null = null;
  for (const o of scene.outlines) {
    const b = outlineBounds(o);
    if (p.x < b.x0 - tol || p.x > b.x1 + tol || p.y < b.y0 - tol || p.y > b.y1 + tol) continue;
    const q = nearestOn(o, p);
    const d = dist(q, p);
    if (d <= tol && (!path || d < path.distance))
      path = { point: q, tag: 'path', guides: [], distance: d };
  }
  if (path) return path;
  // construction guides through `from`, then extensions
  const rays: { at: Point; dir: Point }[] = [];
  if (from) {
    for (const deg of scene.angles ?? DEFAULT_CONSTRUCTION_ANGLES) {
      const a = (-deg * Math.PI) / 180;
      rays.push({ at: from, dir: { x: Math.cos(a), y: Math.sin(a) } });
    }
  }
  rays.push(...(scene.extensions ?? []));
  let best: SmartHit | null = null;
  for (const r of rays) {
    const len = Math.hypot(r.dir.x, r.dir.y);
    if (!(len > 1e-12) || dist(r.at, p) <= tol) continue;
    const u = { x: r.dir.x / len, y: r.dir.y / len };
    const s = (p.x - r.at.x) * u.x + (p.y - r.at.y) * u.y;
    const q = { x: r.at.x + u.x * s, y: r.at.y + u.y * s };
    const d = dist(q, p);
    if (d > tol || (best && d >= best.distance)) continue;
    best = { point: q, guides: [{ from: r.at, to: q }], distance: d };
    // slide along it into line with a marked point (VectorCraft `slide`)
    const slid = slide(r.at, u, q, lines, slideTol);
    if (slid) {
      best = {
        point: slid.q,
        guides: [
          { from: r.at, to: slid.q },
          { from: slid.from, to: slid.q },
        ],
        distance: d,
      };
    }
  }
  return best;
}

/** `q` on the line `at + s·u` moved to where the x or y of a marked point crosses it. */
function slide(at: Point, u: Point, q: Point, lines: readonly Point[], reach: number) {
  let best: { q: Point; from: Point; moved: number } | null = null;
  for (const m of lines) {
    for (const axis of ['x', 'y'] as const) {
      const d = u[axis];
      if (Math.abs(d) <= 1e-9 || Math.abs(m[axis] - q[axis]) > reach) continue;
      const s = (m[axis] - at[axis]) / d;
      const hit = { x: at.x + u.x * s, y: at.y + u.y * s };
      hit[axis] = m[axis];
      const moved = dist(hit, q);
      if (moved <= 2 * reach && (!best || moved < best.moved)) best = { q: hit, from: m, moved };
    }
  }
  return best;
}
