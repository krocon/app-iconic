import { countOf, dragShape, sizedShape } from './drag-shapes';
import { polarGrid, quarterArc, rectGrid, spiral, star, straightRatio } from './more-shapes';

describe('more shapes (prompt 044, from VectorCraft shapes.rs)', () => {
  const c = { x: 100, y: 100 };

  it('a star alternates its radii; straight shoulders for five points', () => {
    const s = star(c, 50, 20, 5, -Math.PI / 2);
    expect(s.anchors).toHaveLength(10);
    expect(s.anchors[0].p.x).toBeCloseTo(100, 9);
    expect(s.anchors[0].p.y).toBeCloseTo(50, 9);
    expect(Math.hypot(s.anchors[1].p.x - 100, s.anchors[1].p.y - 100)).toBeCloseTo(20, 9);
    expect(straightRatio(5)).toBeCloseTo(0.381966, 6);
    expect(straightRatio(4)).toBeNull();
  });

  it('a spiral winds inwards by the decay and starts at its centre end', () => {
    const s = spiral(c, 100, 4);
    expect(s.anchors).toHaveLength(5);
    const r = (i: number) => Math.hypot(s.anchors[i].p.x - 100, s.anchors[i].p.y - 100);
    expect(r(4)).toBeCloseTo(100, 9);
    expect(r(0)).toBeCloseTo(100 * 0.8 ** 4, 9);
    expect(s.anchors[0].hin).toBeNull();
  });

  it('grids: frame and dividers; polar: ellipses and spokes', () => {
    const g = rectGrid(0, 0, 100, 60, 2, 3);
    expect(g).toHaveLength(1 + 2 + 3);
    expect(g[1].anchors.map((a) => a.p.y)).toEqual([20, 20]);
    expect(g[3].anchors.map((a) => a.p.x)).toEqual([25, 25]);
    const p = polarGrid(0, 0, 100, 100, 2, 4);
    expect(p).toHaveLength(3 + 4);
    expect(p[0].anchors[0].p).toEqual({ x: 100, y: 50 });
  });

  it('the arc is a quarter ellipse, convex by default, concave with Alt', () => {
    const a = quarterArc({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(a.anchors[0].hout!.y).toBe(0);
    const concave = dragShape('dragArc', { x: 0, y: 0 }, { x: 100, y: 100 }, { alt: true });
    expect(concave?.kind).toBe('paths');
  });

  it('↑/↓ counts are clamped; round rectangles and stars from a drag and from the dialog', () => {
    expect(countOf('dragStar', 99)).toBe(64);
    expect(countOf('dragSpiral', undefined)).toBe(10);
    expect(dragShape('dragRoundRect', c, { x: 200, y: 150 }, {}, 20)).toMatchObject({
      kind: 'rect',
      w: 100,
      h: 50,
      r: 20,
    });
    const s = sizedShape('dragStar', c, { radius: 40, sides: 6 });
    expect(s?.kind === 'paths' && s.subpaths[0].anchors).toHaveLength(12);
    expect(sizedShape('dragRectGrid', c, { width: 0, height: 10 })).toBeNull();
  });
});
