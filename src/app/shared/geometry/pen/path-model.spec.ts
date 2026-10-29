import {
  addAnchor,
  convertAnchor,
  cutAt,
  eraseAlong,
  fromSubpaths,
  hitAnchor,
  hitSegment,
  joinEnds,
  removeAnchor,
  smoothAlong,
  toSubpaths,
} from './path-model';

describe('path model (prompt 046)', () => {
  it('reads every command; arcs become cubics on the circle; writes M L C Z', () => {
    const s = toSubpaths('M0 0 H10 V10 Q 20 20 30 10 M 50 0 A 10 10 0 0 1 70 0 Z')!;
    expect(s).toHaveLength(2);
    expect(s[0].anchors.map((a) => a.p)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ]);
    expect(s[1].closed).toBe(true);
    // a half circle (sweep 1 = clockwise on screen: upwards): the middle point at (60, -10)
    const mid = s[1].anchors[1].p;
    expect(mid.x).toBeCloseTo(60, 9);
    expect(mid.y).toBeCloseTo(-10, 9);
    expect(
      fromSubpaths([{ anchors: [{ p: { x: 0, y: 0 } }, { p: { x: 1, y: 2 } }], closed: false }]),
    ).toBe('M 0 0 L 1 2');
  });

  it('add / remove / convert anchors; hits', () => {
    const s = toSubpaths('M 0 0 L 100 0 L 100 100')!;
    expect(hitSegment(s, { x: 50, y: 2 }, 4)).toMatchObject({ s: 0, i: 0 });
    expect(hitAnchor(s, { x: 99, y: 1 }, 4)).toMatchObject({ s: 0, i: 1 });
    const added = addAnchor(s, 0, 0, 0.5);
    expect(added[0].anchors[1].p).toEqual({ x: 50, y: 0 });
    expect(removeAnchor(added, 0, 1)).toEqual(s);
    const smooth = convertAnchor(s, 0, 1, true);
    expect(smooth[0].anchors[1].hin).not.toBeNull();
    expect(convertAnchor(smooth, 0, 1, false)[0].anchors[1].hin).toBeNull();
  });

  it('scissors: a closed subpath opens at the point; an open one splits in two', () => {
    const closed = toSubpaths('M 0 0 L 100 0 L 100 100 Z')!;
    const c = cutAt(closed, 0, 1);
    expect(fromSubpaths(c.keep)).toBe('M 100 0 L 100 100 L 0 0 L 100 0');
    expect(c.off).toBeNull();
    const open = cutAt(toSubpaths('M 0 0 L 100 0 L 100 100')!, 0, 1);
    expect(fromSubpaths(open.keep)).toBe('M 0 0 L 100 0');
    expect(fromSubpaths([open.off!])).toBe('M 100 0 L 100 100');
  });

  it('join: two open ends into one; the ends of one subpath close it', () => {
    const s = toSubpaths('M 0 0 L 10 0 M 30 0 L 20 0')!;
    expect(fromSubpaths(joinEnds(s, 0, 'end', 1, 'end'))).toBe('M 0 0 L 10 0 L 20 0 L 30 0');
    expect(fromSubpaths(joinEnds(toSubpaths('M 0 0 L 10 0 L 10 10')!, 0, 'end', 0, 'start'))).toBe(
      'M 0 0 L 10 0 L 10 10 Z',
    );
  });

  it('the eraser cuts what the brush touched; the smooth brush rounds touched corners', () => {
    const s = toSubpaths('M 0 0 L 100 0')!;
    const e = eraseAlong(
      s,
      [
        { x: 50, y: -10 },
        { x: 50, y: 10 },
      ],
      5,
    );
    expect(e).toHaveLength(2);
    expect(e[0].anchors[0].p).toEqual({ x: 0, y: 0 });
    expect(e[0].anchors[1].p.x).toBeGreaterThan(40);
    expect(e[0].anchors[1].p.x).toBeLessThan(46);
    expect(e[1].anchors[1].p).toEqual({ x: 100, y: 0 });
    // a closed square erased at one corner: one open piece around the rest
    const sq = toSubpaths('M 0 0 L 100 0 L 100 100 L 0 100 Z')!;
    const sqE = eraseAlong(sq, [{ x: 100, y: 100 }], 10);
    expect(sqE).toHaveLength(1);
    expect(sqE[0].anchors.length).toBeGreaterThanOrEqual(4);
    const sm = smoothAlong(toSubpaths('M 0 0 L 50 -40 L 100 0')!, [{ x: 50, y: -40 }], 5);
    expect(sm[0].anchors[1].hin).not.toBeNull();
    expect(eraseAlong(s, [{ x: 50, y: 50 }], 5)).toEqual(s);
  });
});

describe('joinEnds on the same spot (prompt 046)', () => {
  it('merges two ends that meet into one point', () => {
    const sp = toSubpaths('M 0 0 L 10 0 M 10 0 L 20 0')!;
    expect(fromSubpaths(joinEnds(sp, 0, 'end', 1, 'start'))).toBe('M 0 0 L 10 0 L 20 0');
  });
});
