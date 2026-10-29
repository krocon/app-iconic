import { fmt } from '../../shared/geometry/align';
import { CORNER_KINDS, CornerKind, cutCorners } from '../../shared/geometry/corners';
import { penPathData, singlePath } from '../../shared/geometry/pen/pen-path';
import { Point } from '../../shared/geometry/view-transform';
import { numberList } from '../canvas/handles/node-geometry';
import { ID_ATTR } from '../document/svg/node-ids';

/**
 * What Live Corners work on (prompt 045): the straight-sided outline of an element in its user
 * space, the radius and kind cut now. A rectangle keeps `rx`/`ry` while its corners are round;
 * anything else becomes a `<path>` whose source points stay in `data-ai-corners` while the
 * document is open (internal, never saved: the next drag starts from the sharp corners again).
 * Pure (reads the element only).
 */

export const CORNERS_ATTR = 'data-ai-corners';

export interface CornerSource {
  type: 'rect' | 'poly' | 'path';
  points: Point[];
  closed: boolean;
  radius: number;
  kind: CornerKind;
}

const num = (el: Element, a: string) => {
  const v = Number.parseFloat(el.getAttribute(a) ?? '');
  return Number.isFinite(v) ? v : 0;
};

/** The corners of `el` to cut, or `null` (curved sides, text, groups …). */
export function cornerSource(el: Element): CornerSource | null {
  switch (el.localName) {
    case 'rect': {
      const [x, y, w, h] = [num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height')];
      if (!(w > 0 && h > 0)) return null;
      const rx = el.hasAttribute('rx') ? num(el, 'rx') : num(el, 'ry');
      return {
        type: 'rect',
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        closed: true,
        radius: Math.max(0, rx),
        kind: 'round',
      };
    }
    case 'polygon':
    case 'polyline': {
      const n = numberList(el.getAttribute('points'));
      const points: Point[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) points.push({ x: n[i], y: n[i + 1] });
      return points.length >= 3
        ? { type: 'poly', points, closed: el.localName === 'polygon', radius: 0, kind: 'round' }
        : null;
    }
    case 'path': {
      const live = parseLive(el.getAttribute(CORNERS_ATTR));
      if (live) return { type: 'path', ...live };
      const p = singlePath(el.getAttribute('d') ?? '');
      if (!p || p.anchors.some((a) => a.hin || a.hout) || p.anchors.length < 3) return null;
      return {
        type: 'path',
        points: p.anchors.map((a) => a.p),
        closed: p.closed,
        radius: 0,
        kind: 'round',
      };
    }
    default:
      return null;
  }
}

function parseLive(text: string | null): Omit<CornerSource, 'type'> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    const pts = v['points'];
    if (!Array.isArray(pts) || pts.length < 3 || pts.length > 10_000) return null;
    const points = pts.map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : null));
    if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const radius = Number(v['radius']);
    const kind = v['kind'] as CornerKind;
    if (!Number.isFinite(radius) || radius < 0 || !CORNER_KINDS.includes(kind)) return null;
    return { points: points as Point[], closed: v['closed'] === true, radius, kind };
  } catch {
    return null;
  }
}

/** The change for `src` cut with `radius` and `kind`: attributes, or new markup for the element. */
export function cornerChange(
  el: Element,
  src: CornerSource,
  radius: number,
  kind: CornerKind,
): { attrs: Record<string, string | null> } | { markup: string } {
  if (src.type === 'rect' && kind === 'round') {
    const w = num(el, 'width');
    const h = num(el, 'height');
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    return { attrs: { rx: r > 0 ? fmt(r) : null, ry: r > 0 ? fmt(r) : null } };
  }
  const d = penPathData(cutCorners(src.points, src.closed, radius, kind), src.closed);
  const live = JSON.stringify({
    points: src.points.map((p) => [p.x, p.y]),
    closed: src.closed,
    radius,
    kind,
  });
  if (src.type === 'path') return { attrs: { d, [CORNERS_ATTR]: live } };
  // a rectangle or polygon becomes a path with the same paint and the rest of its attributes
  const skip = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'points', ID_ATTR, CORNERS_ATTR]);
  const doc = el.ownerDocument;
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const a of Array.from(el.attributes))
    if (!skip.has(a.name)) path.setAttribute(a.name, a.value);
  path.setAttribute('d', d);
  path.setAttribute(CORNERS_ATTR, live);
  for (const c of Array.from(el.childNodes)) path.appendChild(c.cloneNode(true));
  return { markup: new XMLSerializer().serializeToString(path) };
}
