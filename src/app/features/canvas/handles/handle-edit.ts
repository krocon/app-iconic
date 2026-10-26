import { fmt } from '../../../shared/geometry/align';
import { serializePath } from '../../../shared/geometry/path-data';
import {
  insertPoint,
  moveAnchor,
  moveControl,
  removeAnchor,
} from '../../../shared/geometry/path-edit';
import { Point } from '../../../shared/geometry/view-transform';
import { UndoLabel } from '../../document/undo/undo-texts';
import { HandleRole } from './handle-types';
import { NodeGeometry, TextAnchor } from './node-geometry';
import { handlesOf } from './node-handles';

/**
 * What dragging or clicking a point handle writes (design 007 E6, E8): new attribute values from
 * the geometry snapshot taken when the gesture started and the handle's new position in the node's
 * user space. Pure – the canvas turns the result into one `setAttributes` command.
 */

export type Attrs = Record<string, string>;

const pointsText = (ps: readonly Point[]) => ps.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
const listText = (ns: readonly number[]) => ns.map(fmt).join(' ');

/** Fewest points a polyline / polygon keeps. */
const minPoints = (closed: boolean) => (closed ? 3 : 2);

/** The new attributes for a handle dragged to `p` (`null` = this handle does not drag). */
export function dragHandle(g: NodeGeometry, role: HandleRole, p: Point): Attrs | null {
  switch (g.kind) {
    case 'rect': {
      if (role.t === 'move') return { x: fmt(p.x), y: fmt(p.y) };
      if (role.t === 'rectCorner') {
        const fixed = {
          tr: { x: g.x, y: g.y + g.height },
          bl: { x: g.x + g.width, y: g.y },
          br: { x: g.x, y: g.y },
        }[role.corner];
        return {
          x: fmt(Math.min(p.x, fixed.x)),
          y: fmt(Math.min(p.y, fixed.y)),
          width: fmt(Math.abs(p.x - fixed.x)),
          height: fmt(Math.abs(p.y - fixed.y)),
        };
      }
      if (role.t === 'rectRadius') {
        const rx = fmt(Math.min(Math.max(p.x - g.x, 0), g.width / 2));
        return g.hasRy ? { rx, ry: rx } : { rx };
      }
      return null;
    }
    case 'circle':
      if (role.t === 'move') return { cx: fmt(p.x), cy: fmt(p.y) };
      if (role.t === 'radius') return { r: fmt(Math.hypot(p.x - g.cx, p.y - g.cy)) };
      return null;
    case 'ellipse':
      if (role.t === 'move') return { cx: fmt(p.x), cy: fmt(p.y) };
      if (role.t === 'radius' && role.axis === 'rx') return { rx: fmt(Math.abs(p.x - g.cx)) };
      if (role.t === 'radius' && role.axis === 'ry') return { ry: fmt(Math.abs(p.y - g.cy)) };
      return null;
    case 'line':
      if (role.t !== 'lineEnd') return null;
      return role.end === 1 ? { x1: fmt(p.x), y1: fmt(p.y) } : { x2: fmt(p.x), y2: fmt(p.y) };
    case 'poly': {
      const pts = [...g.points];
      if (role.t === 'vertex' && role.index < pts.length) pts[role.index] = p;
      else if (role.t === 'segment' && role.index < pts.length) pts.splice(role.index + 1, 0, p);
      else return null;
      return { points: pointsText(pts) };
    }
    case 'path': {
      let segs = null;
      if (role.t === 'pathAnchor') segs = moveAnchor(g.segs, role.index, p);
      else if (role.t === 'pathControl') segs = moveControl(g.segs, role.seg, role.which, p);
      else if (role.t === 'pathMid') {
        const ins = insertPoint(g.segs, role.seg);
        segs = ins ? moveAnchor(ins.segs, ins.anchor, p) : null;
      }
      return segs ? { d: serializePath(segs) } : null;
    }
    case 'text': {
      if (role.t !== 'move' && role.t !== 'textAnchor') return null;
      // the anchor marker sits beside the position: the position follows at the same offset
      const marker = handlesOf(g).find((x) => x.role.t === role.t)!.local;
      const dx = p.x - marker.x;
      const dy = p.y - marker.y;
      return { x: listText(g.xs.map((v) => v + dx)), y: listText(g.ys.map((v) => v + dy)) };
    }
    case 'box':
      return null;
  }
}

const NEXT_ANCHOR: Record<TextAnchor, TextAnchor> = {
  start: 'middle',
  middle: 'end',
  end: 'start',
};

/** Removes a point (Alt-click, Delete); `null` if the shape would get too small. */
export function deletePoint(g: NodeGeometry, role: HandleRole): Attrs | null {
  if (g.kind === 'poly' && role.t === 'vertex') {
    if (g.points.length <= minPoints(g.closed)) return null;
    return { points: pointsText(g.points.filter((_, i) => i !== role.index)) };
  }
  if (g.kind === 'path' && role.t === 'pathAnchor') {
    const segs = removeAnchor(g.segs, role.index);
    return segs ? { d: serializePath(segs) } : null;
  }
  return null;
}

/** A click without moving: insert at a midpoint, Alt deletes a point, the text marker cycles. */
export function clickHandle(
  g: NodeGeometry,
  role: HandleRole,
  alt: boolean,
): { attrs: Attrs; label: UndoLabel } | null {
  if (role.t === 'segment' && g.kind === 'poly') {
    const a = g.points[role.index];
    const b = g.points[(role.index + 1) % g.points.length];
    const attrs = dragHandle(g, role, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return attrs && { attrs, label: 'insertPoint' };
  }
  if (role.t === 'pathMid' && g.kind === 'path') {
    const ins = insertPoint(g.segs, role.seg);
    return ins && { attrs: { d: serializePath(ins.segs) }, label: 'insertPoint' };
  }
  if (alt && (role.t === 'vertex' || role.t === 'pathAnchor')) {
    const attrs = deletePoint(g, role);
    return attrs && { attrs, label: 'deletePoint' };
  }
  if (role.t === 'textAnchor' && g.kind === 'text') {
    return { attrs: { 'text-anchor': NEXT_ANCHOR[g.anchor] }, label: 'changeAttribute' };
  }
  return null;
}

/** The label of a drag of this handle (legacy §12 names). */
export function dragLabel(role: HandleRole): UndoLabel {
  switch (role.t) {
    case 'move':
      return 'moveNode';
    case 'segment':
    case 'pathMid':
      return 'insertPoint';
    case 'box':
    case 'pivot':
      return 'changeTransform';
    default:
      return 'adjustPath';
  }
}
