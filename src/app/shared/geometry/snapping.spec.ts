import { gridOriginPoint, gridSnap, snapMove, snapPoint } from './snapping';

/** Cases from the template's `SnappingServiceAdditionalTests` / `HandleOverlayGeometryTests`. */
describe('snapping (design 007 E13)', () => {
  it('does not snap when every candidate is outside the tolerance', () => {
    const p = { x: 14.9, y: -7.6 };
    const r = snapPoint(p, [{ x: 5, y: -20 }], {
      zoom: 1,
      grid: true,
      magic: true,
      tolerancePx: 4,
    });
    expect(r.kind).toBe('none');
    expect(r.point).toEqual(p);
    expect(r.target).toBeNull();
  });

  it('magic wins when the distances are equal', () => {
    const r = snapPoint({ x: 14, y: 14 }, [{ x: 18, y: 18 }], {
      zoom: 1,
      grid: true,
      magic: true,
      tolerancePx: 6,
    });
    expect(r.kind).toBe('magic');
    expect(r.point).toEqual({ x: 18, y: 18 });
    expect(r.target).toEqual({ x: 18, y: 18 });
  });

  it('the grid snaps when it is nearer', () => {
    const r = snapPoint({ x: 11, y: 11 }, [{ x: 18, y: 18 }], { zoom: 1, grid: true, magic: true });
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual({ x: 10, y: 10 });
  });

  it('rounds toward the nearest grid cell, for both origins', () => {
    expect(gridSnap({ x: 23, y: -17 }, { x: 0, y: 0 }, 10)).toEqual({ x: 20, y: -20 });
    expect(gridSnap({ x: 63, y: 38 }, { x: 50, y: 50 }, 10)).toEqual({ x: 60, y: 40 });
    expect(gridOriginPoint('worldZero')).toEqual({ x: 0, y: 0 });
    expect(gridOriginPoint('svgCenter')).toEqual({ x: 512, y: 512 });
    expect(gridSnap({ x: 516, y: 509 }, gridOriginPoint('svgCenter'), 10)).toEqual({
      x: 512,
      y: 512,
    });
  });

  it.each([0.5, 1, 1.5])('magic snaps at 19 screen px, not at 21 (zoom %s)', (zoom) => {
    const c = { x: 300, y: 300 };
    const o = { zoom, grid: false, magic: true };
    expect(snapPoint({ x: 300 + 19 / zoom, y: 300 }, [c], o).kind).toBe('magic');
    // farther: no point snap, but it lines up with the point ("align")
    expect(snapPoint({ x: 300 + 21 / zoom, y: 300 }, [c], o).kind).toBe('align');
    expect(snapPoint({ x: 300 + 21 / zoom, y: 307 }, [c], o).kind).toBe(
      7 * zoom <= 6 ? 'align' : 'none',
    );
    expect(snapPoint({ x: 300 + 20 / zoom, y: 300 }, [c], o).kind).toBe('magic');
  });

  it('switched off it never snaps; the nearest of several candidates wins', () => {
    const p = { x: 100, y: 100 };
    expect(snapPoint(p, [p], { zoom: 1, grid: false, magic: false }).kind).toBe('none');
    const r = snapPoint(
      p,
      [
        { x: 110, y: 100 },
        { x: 104, y: 100 },
      ],
      { zoom: 1, grid: false, magic: true },
    );
    expect(r.point).toEqual({ x: 104, y: 100 });
  });

  it('snapMove corrects the delta by the best key point', () => {
    const keys = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    const r = snapMove(keys, { x: 95, y: 3 }, [{ x: 150, y: 50 }], {
      zoom: 1,
      grid: false,
      magic: true,
    });
    expect(r.kind).toBe('magic');
    expect(r.delta).toEqual({ x: 100, y: 0 });
    expect(snapMove(keys, { x: 5, y: 5 }, [], { zoom: 1, grid: false, magic: true }).delta).toEqual(
      {
        x: 5,
        y: 5,
      },
    );
  });

  it.each([0.5, 1, 1.5])(
    'align: each axis lines up with a marked point within 6 screen px (zoom %s)',
    (zoom) => {
      const o = { zoom, grid: false, magic: true };
      // x like the first point, y like the second: two guide lines, from those points
      const a = { x: 100, y: 500 };
      const b = { x: 600, y: 200 };
      const r = snapPoint({ x: 100 + 5 / zoom, y: 200 - 4 / zoom }, [a, b], o);
      expect(r.kind).toBe('align');
      expect(r.point).toEqual({ x: 100, y: 200 });
      expect(r.guides).toEqual([
        { from: a, to: { x: 100, y: 200 } },
        { from: b, to: { x: 100, y: 200 } },
      ]);
      // one axis only: the other stays free (or on the grid when that is on)
      const one = snapPoint({ x: 100 + 5 / zoom, y: 333 }, [a], o);
      expect(one.point).toEqual({ x: 100, y: 333 });
      expect(one.guides).toEqual([{ from: a, to: { x: 100, y: 333 } }]);
      const grid = snapPoint({ x: 100 + 5 / zoom, y: 333 }, [a], { ...o, grid: true });
      expect(grid.point).toEqual({ x: 100, y: 330 });
      expect(snapPoint({ x: 100 + 7 / zoom, y: 333 }, [a], o).kind).toBe('none');
      expect(snapPoint({ x: 105, y: 333 }, [a], { ...o, align: false }).kind).toBe('none');
    },
  );

  it('align: several points on the same line – the guide starts at the nearest', () => {
    const r = snapPoint(
      { x: 52, y: 300 },
      [
        { x: 50, y: 0 },
        { x: 50, y: 280 },
      ],
      { zoom: 1, grid: false, magic: true },
    );
    expect(r.guides[0].from).toEqual({ x: 50, y: 280 });
  });

  it('a crossing is a point to land on ("intersect"), never a line to align with', () => {
    const x = { x: 200, y: 300, tag: 'intersect' as const };
    const o = { zoom: 1, grid: false, magic: true };
    const r = snapPoint({ x: 205, y: 304 }, [x], o);
    expect(r).toMatchObject({ kind: 'magic', point: { x: 200, y: 300 }, tag: 'intersect' });
    expect(snapPoint({ x: 203, y: 380 }, [x], o).kind).toBe('none');
  });
});
