import { apply, applyLinear, invert, multiply } from '../../../shared/geometry/matrix';
import { parsePath } from '../../../shared/geometry/path-data';
import { clickHandle, deletePoint, dragHandle, dragLabel } from './handle-edit';
import { HandleRole } from './handle-types';
import { NodeGeometry, numberList, pointList } from './node-geometry';
import { boxHandles, handlesOf, wantsBox } from './node-handles';

const rect: NodeGeometry = {
  kind: 'rect',
  x: 30,
  y: 45,
  width: 140,
  height: 96,
  rx: 0,
  ry: 0,
  hasRy: false,
};
const role = (g: NodeGeometry, t: string) => handlesOf(g).find((h) => h.role.t === t)!.role;

describe('node handles (design 007 E6)', () => {
  it('rect: top left moves, three corners resize, radius only when rounded', () => {
    const hs = handlesOf(rect);
    expect(hs.map((h) => [h.kind, h.label, h.local])).toEqual([
      ['position', 'Top-left', { x: 30, y: 45 }],
      ['size', 'Top-right', { x: 170, y: 45 }],
      ['size', 'Bottom-left', { x: 30, y: 141 }],
      ['size', 'Bottom-right', { x: 170, y: 141 }],
    ]);
    const round = handlesOf({ ...rect, rx: 8, ry: 8 });
    expect(round.at(-1)).toMatchObject({
      kind: 'control',
      label: 'Corner Radius',
      local: { x: 38, y: 45 },
    });
    expect(dragHandle(rect, { t: 'move' }, { x: 1, y: 2 })).toEqual({ x: '1', y: '2' });
    // bottom right dragged up past the top: the top left stays fixed, the size never goes negative
    expect(dragHandle(rect, { t: 'rectCorner', corner: 'br' }, { x: 200, y: 20 })).toEqual({
      x: '30',
      y: '20',
      width: '170',
      height: '25',
    });
    expect(dragHandle(rect, { t: 'rectCorner', corner: 'tr' }, { x: 100, y: 0 })).toEqual({
      x: '30',
      y: '0',
      width: '70',
      height: '141',
    });
    expect(dragHandle({ ...rect, rx: 5, ry: 5 }, { t: 'rectRadius' }, { x: 50, y: 0 })).toEqual({
      rx: '20',
    });
    expect(
      dragHandle({ ...rect, rx: 5, ry: 5, hasRy: true }, { t: 'rectRadius' }, { x: 999, y: 0 }),
    ).toEqual({
      rx: '70',
      ry: '70',
    });
  });

  it('circle, ellipse and line', () => {
    const c: NodeGeometry = { kind: 'circle', cx: 10, cy: 10, r: 5 };
    expect(handlesOf(c).map((h) => h.local)).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 10 },
    ]);
    expect(dragHandle(c, { t: 'radius', axis: 'r' }, { x: 13, y: 14 })).toEqual({ r: '5' });
    const e: NodeGeometry = { kind: 'ellipse', cx: 0, cy: 0, rx: 4, ry: 2 };
    expect(handlesOf(e).map((h) => h.label)).toEqual([
      'Center',
      'Horizontal Radius',
      'Vertical Radius',
    ]);
    expect(dragHandle(e, { t: 'radius', axis: 'ry' }, { x: 9, y: -7 })).toEqual({ ry: '7' });
    const l: NodeGeometry = { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
    expect(dragHandle(l, { t: 'lineEnd', end: 2 }, { x: 3, y: 4.123456 })).toEqual({
      x2: '3',
      y2: '4.1235',
    });
  });

  it('polygon: points and segment midpoints; insert, delete with a minimum', () => {
    const g: NodeGeometry = {
      kind: 'poly',
      points: pointList('100,80 160,120 120,160'),
      closed: true,
    };
    const hs = handlesOf(g);
    expect(hs.filter((h) => h.kind === 'anchor')).toHaveLength(3);
    expect(hs.filter((h) => h.kind === 'midpoint').map((h) => h.local)).toEqual([
      { x: 130, y: 100 },
      { x: 140, y: 140 },
      { x: 110, y: 120 },
    ]);
    expect(clickHandle(g, { t: 'segment', index: 2 }, false)).toEqual({
      attrs: { points: '100,80 160,120 120,160 110,120' },
      label: 'insertPoint',
    });
    expect(deletePoint(g, { t: 'vertex', index: 0 })).toBeNull(); // a triangle stays a triangle
    const open: NodeGeometry = { kind: 'poly', points: pointList('0 0 10 0 10 10'), closed: false };
    expect(handlesOf(open).filter((h) => h.kind === 'midpoint')).toHaveLength(2);
    expect(clickHandle(open, { t: 'vertex', index: 1 }, true)).toEqual({
      attrs: { points: '0,0 10,10' },
      label: 'deletePoint',
    });
    expect(clickHandle(open, { t: 'vertex', index: 1 }, false)).toBeNull();
  });

  // template testPolygonVertexDragUsesAncestorTransform: a document move becomes A⁻¹·d locally
  it('a vertex dragged in document space lands at the inverse of the combined matrix', () => {
    const parent = { a: 1.6, b: 0, c: 0, d: 0.75, e: 40, f: -24 };
    const a = Math.PI / 7;
    const own = { a: Math.cos(a), b: Math.sin(a), c: -Math.sin(a), d: Math.cos(a), e: 0, f: 0 };
    const toDoc = multiply(parent, own);
    const g: NodeGeometry = {
      kind: 'poly',
      points: pointList('100,80 160,120 120,160'),
      closed: true,
    };
    const world = apply(toDoc, { x: 100, y: 80 });
    const d = { x: 30, y: -18 };
    const local = apply(invert(toDoc)!, { x: world.x + d.x, y: world.y + d.y });
    const expected = applyLinear(invert({ ...toDoc, e: 0, f: 0 })!, d);
    const out = pointList(dragHandle(g, { t: 'vertex', index: 0 }, local)!['points']);
    expect(out[0].x).toBeCloseTo(100 + expected.x, 3);
    expect(out[0].y).toBeCloseTo(80 + expected.y, 3);
  });

  it('path: anchors, controls with their anchor, midpoints; drag a midpoint inserts and moves', () => {
    const g: NodeGeometry = {
      kind: 'path',
      segs: parsePath('M80 90 L140 120 c30 -10 60 20 90 30')!,
    };
    const hs = handlesOf(g);
    expect(hs.filter((h) => h.kind === 'anchor')).toHaveLength(3);
    const controls = hs.filter((h) => h.kind === 'control');
    expect(controls.map((h) => [h.local, h.tie])).toEqual([
      [
        { x: 170, y: 110 },
        { x: 140, y: 120 },
      ],
      [
        { x: 200, y: 140 },
        { x: 230, y: 150 },
      ],
    ]);
    expect(dragHandle(g, { t: 'pathAnchor', index: 2 }, { x: 240, y: 150 })).toEqual({
      d: 'M80 90 L140 120 c30 -10 70 20 100 30',
    });
    expect(dragHandle(g, { t: 'pathMid', seg: 1 }, { x: 100, y: 120 })).toEqual({
      d: 'M80 90 L100 120 L140 120 c30 -10 60 20 90 30',
    });
    expect(clickHandle(g, { t: 'pathAnchor', index: 1 }, true)!.label).toBe('deletePoint');
  });

  it('text: position, an anchor marker per text-anchor that cycles on click and drags along', () => {
    const t: NodeGeometry = { kind: 'text', xs: [10, 20], ys: [5], anchor: 'start' };
    const hs = handlesOf(t);
    expect(hs.map((h) => [h.label, h.local])).toEqual([
      ['Position', { x: 10, y: 5 }],
      ['Start Anchor', { x: -10, y: 5 }],
    ]);
    expect(handlesOf({ ...t, anchor: 'middle' })[1].local).toEqual({ x: 10, y: -15 });
    expect(handlesOf({ ...t, anchor: 'end' })[1].local).toEqual({ x: 30, y: 5 });
    expect(dragHandle(t, { t: 'move' }, { x: 11, y: 7 })).toEqual({ x: '11 21', y: '7' });
    expect(dragHandle(t, { t: 'textAnchor' }, { x: -9, y: 7 })).toEqual({ x: '11 21', y: '7' });
    expect(clickHandle(t, role(t, 'textAnchor'), false)).toEqual({
      attrs: { 'text-anchor': 'middle' },
      label: 'changeAttribute',
    });
    expect(wantsBox(t)).toBe(true);
  });

  it('box handles, labels, list parsing', () => {
    expect(boxHandles({ x: 0, y: 0, width: 10, height: 20 }).map((h) => h.local)).toHaveLength(8);
    expect(handlesOf({ kind: 'box' })).toEqual([]);
    const labels: [HandleRole, string][] = [
      [{ t: 'move' }, 'moveNode'],
      [{ t: 'segment', index: 0 }, 'insertPoint'],
      [{ t: 'box', handle: 'top' }, 'changeTransform'],
      [{ t: 'pathAnchor', index: 0 }, 'adjustPath'],
    ];
    for (const [r, l] of labels) expect(dragLabel(r)).toBe(l);
    expect(numberList('1,2 -3e1 .5')).toEqual([1, 2, -30, 0.5]);
    expect(pointList('1 2 3')).toEqual([{ x: 1, y: 2 }]);
  });
});
