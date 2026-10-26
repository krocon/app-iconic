import { BOX_HANDLES, boxHandlePoint } from '../../../shared/geometry/box-math';
import { Rect } from '../../../shared/geometry/dom-geometry';
import { pathAnchors, pathControls, pathMidpoints } from '../../../shared/geometry/path-edit';
import { Point } from '../../../shared/geometry/view-transform';
import { Handle, HandleKind, HandleRole, roleId } from './handle-types';
import { NodeGeometry } from './node-geometry';

/**
 * The point handles of a node (design 007 E6; legacy §6, `HandleTypes.swift` of the template) in
 * the node's own user space – the overlay maps them with the browser's matrix (`nodeToDocument`).
 * Pure.
 */

const h = (
  kind: HandleKind,
  role: HandleRole,
  local: Point,
  label: string,
  tie?: Point,
): Handle => ({
  id: roleId(role),
  kind,
  role,
  local,
  label,
  ...(tie ? { tie } : {}),
});

/** Text-anchor marker offset (template: ±20). */
export const TEXT_ANCHOR_OFFSET = 20;

export function handlesOf(g: NodeGeometry): Handle[] {
  switch (g.kind) {
    case 'rect': {
      const { x, y, width: w, height: hh } = g;
      const out = [
        h('position', { t: 'move' }, { x, y }, 'Top-left'),
        h('size', { t: 'rectCorner', corner: 'tr' }, { x: x + w, y }, 'Top-right'),
        h('size', { t: 'rectCorner', corner: 'bl' }, { x, y: y + hh }, 'Bottom-left'),
        h('size', { t: 'rectCorner', corner: 'br' }, { x: x + w, y: y + hh }, 'Bottom-right'),
      ];
      if (g.rx > 0 || g.ry > 0)
        out.push(h('control', { t: 'rectRadius' }, { x: x + g.rx, y }, 'Corner Radius'));
      return out;
    }
    case 'circle':
      return [
        h('position', { t: 'move' }, { x: g.cx, y: g.cy }, 'Center'),
        h('size', { t: 'radius', axis: 'r' }, { x: g.cx + g.r, y: g.cy }, 'Radius'),
      ];
    case 'ellipse':
      return [
        h('position', { t: 'move' }, { x: g.cx, y: g.cy }, 'Center'),
        h('size', { t: 'radius', axis: 'rx' }, { x: g.cx + g.rx, y: g.cy }, 'Horizontal Radius'),
        h('size', { t: 'radius', axis: 'ry' }, { x: g.cx, y: g.cy + g.ry }, 'Vertical Radius'),
      ];
    case 'line':
      return [
        h('position', { t: 'lineEnd', end: 1 }, { x: g.x1, y: g.y1 }, 'Start'),
        h('position', { t: 'lineEnd', end: 2 }, { x: g.x2, y: g.y2 }, 'End'),
      ];
    case 'poly': {
      const n = g.points.length;
      const segs = n < 2 ? 0 : g.closed ? n : n - 1;
      return [
        ...g.points.map((p, index) => h('anchor', { t: 'vertex', index }, p, `Point ${index + 1}`)),
        ...Array.from({ length: segs }, (_, index) => {
          const a = g.points[index];
          const b = g.points[(index + 1) % n];
          return h(
            'midpoint',
            { t: 'segment', index },
            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            `Segment ${index + 1}`,
          );
        }),
      ];
    }
    case 'path':
      return [
        ...pathMidpoints(g.segs).map((m) =>
          h('midpoint', { t: 'pathMid', seg: m.seg }, m.p, `Segment ${m.seg}`),
        ),
        ...pathControls(g.segs).map((c) =>
          h(
            'control',
            { t: 'pathControl', seg: c.seg, which: c.which },
            c.p,
            `Control ${c.seg}`,
            c.anchor,
          ),
        ),
        ...pathAnchors(g.segs).map((a) =>
          h('anchor', { t: 'pathAnchor', index: a.index }, a.p, `Anchor ${a.index + 1}`),
        ),
      ];
    case 'text': {
      const p = { x: g.xs[0], y: g.ys[0] };
      const off = TEXT_ANCHOR_OFFSET;
      const at =
        g.anchor === 'middle'
          ? { x: p.x, y: p.y - off }
          : { x: p.x + (g.anchor === 'end' ? off : -off), y: p.y };
      const name = { start: 'Start Anchor', middle: 'Middle Anchor', end: 'End Anchor' }[g.anchor];
      return [
        h('position', { t: 'move' }, p, 'Position'),
        h('anchor', { t: 'textAnchor' }, at, name, p),
      ];
    }
    case 'box':
      return [];
  }
}

/** Box handles (design 007 E7) around `r` in the space of the box. */
export function boxHandles(r: Rect): Handle[] {
  return BOX_HANDLES.map((b) => h('size', { t: 'box', handle: b }, boxHandlePoint(r, b), b));
}

/** Nodes whose geometry has no point handles get box handles in point mode too (design 007 E6). */
export function wantsBox(g: NodeGeometry): boolean {
  return g.kind === 'box' || g.kind === 'text';
}
