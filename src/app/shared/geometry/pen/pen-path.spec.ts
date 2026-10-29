import { constrain45, dragHandles, openTail, penPathData, reverseAnchors } from './pen-path';

describe('pen path (prompt 042)', () => {
  it('lines without handles, cubics with them; closed with Z and the closing curve', () => {
    expect(penPathData([{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 0 } }], false)).toBe(
      'M 0 0 L 10 0',
    );
    expect(
      penPathData(
        [
          { p: { x: 0, y: 0 }, hout: { x: 5, y: -5 } },
          { p: { x: 10, y: 0 }, hin: { x: 10, y: -5 }, hout: { x: 10, y: 5 } },
        ],
        true,
      ),
    ).toBe('M 0 0 C 5 -5 10 -5 10 0 C 10 5 0 0 0 0 Z');
    expect(penPathData([], false)).toBe('');
  });

  it('dragged handles are symmetric; Alt keeps the incoming one; Shift steps 45°', () => {
    const a = { p: { x: 10, y: 10 }, hin: { x: 0, y: 0 } };
    expect(dragHandles(a, { x: 20, y: 15 }, false)).toEqual({
      p: a.p,
      hout: { x: 20, y: 15 },
      hin: { x: 0, y: 5 },
    });
    expect(dragHandles(a, { x: 20, y: 15 }, true).hin).toEqual({ x: 0, y: 0 });
    const c = constrain45({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(c.x).toBeCloseTo(Math.hypot(10, 1), 12);
    expect(c.y).toBe(0);
  });

  it('the open last subpath as anchors (quadratics as cubics); closed or arcs: none', () => {
    const t = openTail('M0 0 L10 10 M20 20 L30 20 Q40 20 40 30')!;
    expect(t.prefix).toBe('M0 0 L10 10');
    expect(t.anchors.map((a) => a.p)).toEqual([
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 40, y: 30 },
    ]);
    expect(t.anchors[1].hout!.x).toBeCloseTo(30 + (2 / 3) * 10, 12);
    expect(openTail('M0 0 L10 0 L10 10 Z')).toBeNull();
    expect(openTail('M0 0 A 5 5 0 0 1 10 0')).toBeNull();
    const r = reverseAnchors(t.anchors);
    expect(r[0].p).toEqual({ x: 40, y: 30 });
    expect(r[1].hin).toEqual(t.anchors[1].hout);
  });
});
