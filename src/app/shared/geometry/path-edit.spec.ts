import { parsePath, serializePath } from './path-data';
import {
  insertPoint,
  moveAnchor,
  moveControl,
  pathAnchors,
  pathControls,
  pathMidpoints,
  removeAnchor,
} from './path-edit';

const segsOf = (d: string) => parsePath(d)!;

/** Cases from the template's `PathEditingTests` and `HandleOverlayGeometryTests`. */
describe('path editing (design 007 E8)', () => {
  it('a line path has anchors and midpoints', () => {
    const s = segsOf('M0 0 L100 0 L100 100');
    expect(pathAnchors(s).map((a) => a.p)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(pathMidpoints(s).map((m) => m.p)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(pathControls(s)).toEqual([]);
  });

  it('inserting into a line splits it; removing restores the segment', () => {
    const ins = insertPoint(segsOf('M0 0 L100 0 L100 100'), 1)!;
    expect(ins.anchor).toBe(1);
    expect(serializePath(ins.segs)).toBe('M0 0 L50 0 L100 0 L100 100');
    const rem = removeAnchor(ins.segs, 1)!;
    expect(serializePath(rem)).toBe('M0 0 L100 0 L100 100');
  });

  it('inserting into a cubic adds an anchor on the curve; removing takes it away again', () => {
    const s = segsOf('M0 0 C30 0 70 100 100 100');
    const ins = insertPoint(s, 1)!;
    expect(pathAnchors(ins.segs)).toHaveLength(3);
    expect(ins.segs.filter((x) => x.cmd === 'C')).toHaveLength(2);
    expect(pathAnchors(ins.segs)[1].p).toEqual(pathMidpoints(s)[0].p);
    const rem = removeAnchor(ins.segs, 1)!;
    expect(pathAnchors(rem)).toHaveLength(2);
    expect(rem[1].cmd).toBe('C');
  });

  const closed =
    'M0 0 C25 -10 75 -10 100 0 C110 25 110 75 100 100 C75 110 25 110 0 100 C-10 75 -10 25 0 0 Z';

  it('a closed cubic path keeps its Z when points are inserted or removed', () => {
    const s = segsOf(closed);
    expect(s.at(-1)!.cmd).toBe('Z');
    const ins = insertPoint(s, 1)!;
    expect(ins.segs.at(-1)!.cmd).toBe('Z');
    expect(pathAnchors(ins.segs).length).toBe(pathAnchors(s).length + 1);
    const rem = removeAnchor(s, 1)!;
    expect(rem.at(-1)!.cmd).toBe('Z');
    expect(pathAnchors(rem).length).toBe(pathAnchors(s).length - 1);
  });

  it('moving an anchor takes the attached controls along (relative data too)', () => {
    // template testPathHandleDragUpdatesSegments: M, L, relative c
    const s = segsOf('M80 90 L140 120 c30 -10 60 20 90 30');
    const moved = moveAnchor(s, 1, { x: 150, y: 110 })!;
    expect(moved[1].p).toEqual({ x: 150, y: 110 });
    expect(moved[2].c1).toEqual({ x: 180, y: 100 });
    expect(moved[2].p).toEqual({ x: 230, y: 150 }); // the next anchor stays
    expect(serializePath(moved)).toBe('M80 90 L150 110 c30 -10 50 30 80 40');
    const ctl = moveControl(moved, 2, 'c1', { x: 170, y: 112 })!;
    expect(ctl[2].c1).toEqual({ x: 170, y: 112 });
    expect(serializePath(ctl)).toBe('M80 90 L150 110 c20 2 50 30 80 40');
    expect(moveControl(segsOf('M0 0 S1 1 2 2'), 1, 'c1', { x: 0, y: 0 })).toBeNull();
  });

  it('removing the start point moves M; the last anchor of a line cannot go', () => {
    expect(serializePath(removeAnchor(segsOf('M0 0 L10 0 L10 10'), 0)!)).toBe('M10 0 L10 10');
    expect(removeAnchor(segsOf('M0 0 L10 0'), 1)).toBeNull();
    expect(removeAnchor(segsOf('M0 0 L10 0'), 0)).toBeNull();
  });

  it('controls of C, S and Q; quadratic split; arcs cannot be split', () => {
    const s = segsOf('M0 0 C1 1 2 2 3 3 S5 5 6 6 Q7 7 8 8');
    expect(pathControls(s).map((c) => [c.seg, c.which])).toEqual([
      [1, 'c1'],
      [1, 'c2'],
      [2, 'c2'],
      [3, 'c1'],
    ]);
    const q = insertPoint(segsOf('M0 0 Q50 100 100 0'), 1)!;
    expect(serializePath(q.segs)).toBe('M0 0 Q25 50 50 50 Q75 50 100 0');
    expect(insertPoint(segsOf('M0 0 A5 5 0 0 0 10 0'), 1)).toBeNull();
  });
});
