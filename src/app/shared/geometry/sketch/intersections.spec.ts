import { crossings, intersect, OwnedOutline } from './intersections';

const close = (ps: { x: number; y: number }[], want: { x: number; y: number }[], d = 1e-9) => {
  expect(ps).toHaveLength(want.length);
  for (const w of want) {
    expect(
      ps.some((p) => Math.abs(p.x - w.x) < d && Math.abs(p.y - w.y) < d),
      JSON.stringify(ps),
    ).toBe(true);
  }
};

describe('intersections ("intersect" like VectorCraft)', () => {
  it('line × line: the crossing; parallel and missing segments none', () => {
    close(
      intersect(
        { kind: 'segment', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
        { kind: 'segment', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } },
      ),
      [{ x: 5, y: 5 }],
    );
    expect(
      intersect(
        { kind: 'segment', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
        { kind: 'segment', a: { x: 0, y: 1 }, b: { x: 10, y: 1 } },
      ),
    ).toEqual([]);
    expect(
      intersect(
        { kind: 'segment', a: { x: 0, y: 0 }, b: { x: 4, y: 4 } },
        { kind: 'segment', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } },
      ),
    ).toEqual([]);
  });

  it('line × circle: two points, a tangent one, none', () => {
    const c = { kind: 'circle' as const, c: { x: 0, y: 0 }, r: 5 };
    close(intersect({ kind: 'segment', a: { x: -10, y: 3 }, b: { x: 10, y: 3 } }, c), [
      { x: -4, y: 3 },
      { x: 4, y: 3 },
    ]);
    close(intersect(c, { kind: 'segment', a: { x: -10, y: 5 }, b: { x: 10, y: 5 } }), [
      { x: 0, y: 5 },
    ]);
    expect(intersect({ kind: 'segment', a: { x: -10, y: 6 }, b: { x: 10, y: 6 } }, c)).toEqual([]);
  });

  it('circle × circle: two points; inside or apart none', () => {
    close(
      intersect(
        { kind: 'circle', c: { x: 0, y: 0 }, r: 5 },
        { kind: 'circle', c: { x: 6, y: 0 }, r: 5 },
      ),
      [
        { x: 3, y: 4 },
        { x: 3, y: -4 },
      ],
    );
    expect(
      intersect(
        { kind: 'circle', c: { x: 0, y: 0 }, r: 5 },
        { kind: 'circle', c: { x: 1, y: 0 }, r: 1 },
      ),
    ).toEqual([]);
  });

  it('a rectangle and a circle crossing: four points; its own corners are no crossings', () => {
    const rect = [
      [0, 0, 100, 0],
      [100, 0, 100, 100],
      [100, 100, 0, 100],
      [0, 100, 0, 0],
    ].map(([ax, ay, bx, by]): OwnedOutline => ({
      owner: 'r',
      outline: { kind: 'segment', a: { x: ax, y: ay }, b: { x: bx, y: by } },
    }));
    const circle: OwnedOutline = {
      owner: 'c',
      outline: { kind: 'circle', c: { x: 100, y: 100 }, r: 50 },
    };
    close(crossings([...rect, circle]), [
      { x: 100, y: 50 },
      { x: 50, y: 100 },
    ]);
    // a self-crossing polygon (a bow tie) crosses itself in the middle
    const bow: OwnedOutline[] = [
      [0, 0, 10, 10],
      [10, 10, 10, 0],
      [10, 0, 0, 10],
      [0, 10, 0, 0],
    ].map(([ax, ay, bx, by]) => ({
      owner: 'b',
      outline: { kind: 'segment', a: { x: ax, y: ay }, b: { x: bx, y: by } },
    }));
    close(crossings(bow), [{ x: 5, y: 5 }]);
  });
});
