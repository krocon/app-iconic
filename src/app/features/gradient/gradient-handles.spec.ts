import { IDENTITY } from '../../shared/geometry/matrix';
import { dragHandle, gradientSpace, handlesOf } from './gradient-handles';
import { GradientInfo } from './gradient-model';

const info = (
  kind: 'linear' | 'radial',
  coords: Record<string, number>,
  units = 'objectBoundingBox',
) => ({ kind, units, coords, stops: [] }) as unknown as GradientInfo;

describe('gradient handles (prompt 032)', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 };

  it('bounding box units map the unit square onto the box (after gradientTransform)', () => {
    const s = gradientSpace('objectBoundingBox', IDENTITY, box);
    const h = handlesOf(info('linear', { x1: 0, y1: 0, x2: 1, y2: 1 }), s);
    expect(h.map((x) => x.at)).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 70 },
    ]);
    const r = gradientSpace('objectBoundingBox', { a: 1, b: 0, c: 0, d: 1, e: 0.5, f: 0 }, box);
    expect(handlesOf(info('linear', { x1: 0, y1: 0, x2: 1, y2: 0 }), r)[0].at).toEqual({
      x: 60,
      y: 20,
    });
  });

  it('dragging writes gradient coordinates back (inverse), rounded', () => {
    const s = gradientSpace('objectBoundingBox', IDENTITY, box);
    const i = info('linear', { x1: 0, y1: 0, x2: 1, y2: 0 });
    expect(dragHandle(i, s, 'end', { x: 60, y: 45 })).toEqual({ x2: '0.5', y2: '0.5' });
    const u = gradientSpace('userSpaceOnUse', IDENTITY, box);
    const iu = info('linear', { x1: 0, y1: 0, x2: 1, y2: 0 }, 'userSpaceOnUse');
    expect(dragHandle(iu, u, 'start', { x: 3.14159, y: 2 })).toEqual({ x1: '3.14', y1: '2' });
  });

  it('radial: radius as distance; the centre takes a joined focus along', () => {
    const s = gradientSpace('userSpaceOnUse', IDENTITY, box);
    const r = info('radial', { cx: 50, cy: 50, r: 10, fx: 50, fy: 50 }, 'userSpaceOnUse');
    expect(handlesOf(r, s).map((h) => h.id)).toEqual(['center', 'radius', 'focus']);
    expect(handlesOf(r, s)[1].at).toEqual({ x: 60, y: 50 });
    expect(dragHandle(r, s, 'radius', { x: 53, y: 54 })).toEqual({ r: '5' });
    expect(dragHandle(r, s, 'center', { x: 0, y: 0 })).toEqual({
      cx: '0',
      cy: '0',
      fx: null,
      fy: null,
    });
    const f = info('radial', { cx: 50, cy: 50, r: 10, fx: 55, fy: 50 }, 'userSpaceOnUse');
    expect(dragHandle(f, s, 'center', { x: 0, y: 0 })).toMatchObject({ fx: '5', fy: '0' });
  });
});
