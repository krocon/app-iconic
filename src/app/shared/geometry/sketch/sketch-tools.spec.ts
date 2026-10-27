import { Point } from '../view-transform';
import { Tangent } from './apollonius';
import {
  arcEnds,
  degFromVector,
  dist,
  rectCorners,
  SketchShape,
  vectorFromDeg,
} from './sketch-shapes';
import { Locks, measure, Placed, resolveStep, shapeOf, SketchToolId } from './sketch-tools';

/** Plays the steps like the mouse does: resolve each point, then the shape. */
function play(
  tool: SketchToolId,
  points: Point[],
  locks: Locks[] = [],
  extra: Partial<Placed>[] = [],
) {
  const placed: Placed[] = [];
  let sweep = 0;
  points.forEach((p, i) => {
    const step = { ...resolveStep(tool, placed, p, locks[i] ?? {}, sweep), ...extra[i] };
    sweep = step.sweep ?? sweep;
    placed.push(step);
  });
  return shapeOf(tool, placed, null);
}

const close = (a: Point, b: Point, d = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(d);
  expect(Math.abs(a.y - b.y)).toBeLessThan(d);
};

describe('sketch shapes (design 019 E8)', () => {
  it('field angles are counter-clockwise from the right', () => {
    expect(degFromVector({ x: 1, y: 0 })).toBe(0);
    expect(degFromVector({ x: 0, y: -1 })).toBeCloseTo(90, 12);
    expect(degFromVector({ x: -1, y: 0 })).toBeCloseTo(180, 12);
    expect(degFromVector({ x: 0, y: 1 })).toBeCloseTo(270, 12);
    close(vectorFromDeg(90), { x: 0, y: -1 });
  });
});

describe('sketch tools (design 019 E5)', () => {
  it('line: two clicks, or length and angle typed', () => {
    expect(
      play('line', [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
      ]),
    ).toEqual({
      kind: 'line',
      a: { x: 10, y: 20 },
      b: { x: 110, y: 20 },
    });
    const s = play(
      'line',
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      [{}, { length: 100, angle: 90 }],
    );
    expect(s?.kind).toBe('line');
    if (s?.kind === 'line') close(s.b, { x: 0, y: -100 });
  });

  it('midpoint line: the first click is the middle', () => {
    const s = play(
      'midpointLine',
      [
        { x: 100, y: 100 },
        { x: 150, y: 100 },
      ],
      [{}, { length: 300 }],
    );
    expect(s).toEqual({ kind: 'line', a: { x: -50, y: 100 }, b: { x: 250, y: 100 } });
  });

  it('2-point and centre rectangles keep the pointer side for typed sizes', () => {
    const r = play(
      'rect2p',
      [
        { x: 100, y: 100 },
        { x: 50, y: 180 },
      ],
      [{}, { width: 200 }],
    );
    expect(r).toEqual({ kind: 'rect', c: { x: 0, y: 140 }, w: 200, h: 80, angle: 0 });
    const c = play(
      'rectCenter',
      [
        { x: 500, y: 500 },
        { x: 0, y: 0 },
      ],
      [{}, { width: 100, height: 60 }],
    );
    expect(c).toEqual({ kind: 'rect', c: { x: 500, y: 500 }, w: 100, h: 60, angle: 0 });
  });

  it('3-point rectangle 200 × 100 at 30°', () => {
    const s = play(
      'rect3p',
      [
        { x: 100, y: 400 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [{}, { length: 200, angle: 30 }, { height: 100 }],
    );
    expect(s?.kind).toBe('rect');
    if (s?.kind !== 'rect') return;
    expect(s.w).toBeCloseTo(200, 9);
    expect(s.h).toBeCloseTo(100, 9);
    const corners = rectCorners(s);
    const e = vectorFromDeg(30);
    const a = { x: 100, y: 400 };
    const b = { x: 100 + 200 * e.x, y: 400 + 200 * e.y };
    for (const q of [a, b]) expect(corners.some((c) => dist(c, q) < 1e-9)).toBe(true);
    // the pointer (0, 0) lies on the left of the edge → the other corners are up-left of it
    const others = corners.filter((c) => dist(c, a) > 1e-6 && dist(c, b) > 1e-6);
    for (const c of others) expect(Math.min(dist(c, a), dist(c, b))).toBeCloseTo(100, 9);
    expect(others.every((c) => c.y < 400)).toBe(true);
  });

  it('circles: centre + diameter, two points, three points', () => {
    const cd = play(
      'circleCenter',
      [
        { x: 10, y: 10 },
        { x: 0, y: 99 },
      ],
      [{}, { diameter: 50 }],
    );
    expect(cd?.kind === 'circle' && cd.r).toBeCloseTo(25, 9);
    expect(
      play('circle2p', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({
      kind: 'circle',
      c: { x: 50, y: 0 },
      r: 50,
    });
    const s = play('circle3p', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(s?.kind === 'circle' && s.r).toBeCloseTo(50, 9);
    expect(
      play('circle3p', [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
  });

  it('tangent circles from picked targets', () => {
    const t = (a: Point, b: Point): Tangent => {
      const l = dist(a, b);
      return { kind: 'line', p: a, d: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } };
    };
    const A = { x: 0, y: 0 };
    const B = { x: 400, y: 0 };
    const C = { x: 0, y: 300 };
    const picks: Partial<Placed>[] = [
      { tangent: t(A, B) },
      { tangent: t(B, C) },
      { tangent: t(C, A) },
    ];
    const inc = play('circle3t', [A, B, C, { x: 90, y: 90 }], [], picks);
    expect(inc?.kind === 'circle' && inc.r).toBeCloseTo(100, 9);
    // two lines + diameter: the centre nearest to the pointer
    const two = play(
      'circle2t',
      [A, C, { x: 60, y: 40 }],
      [{}, {}, { diameter: 80 }],
      picks.slice(0, 1).concat([{ tangent: t(C, A) }]),
    );
    expect(two).toEqual(expect.objectContaining({ kind: 'circle' }));
    if (two?.kind === 'circle') {
      expect(two.r).toBeCloseTo(40, 9);
      close(two.c, { x: 40, y: 40 }, 1e-9);
    }
  });

  it('3-point arc passes its third point; a typed radius keeps the pointer side', () => {
    const s = play('arc3p', [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 100, y: -100 },
    ]);
    expect(s?.kind).toBe('arc');
    if (s?.kind !== 'arc') return;
    expect(s.r).toBeCloseTo(100, 9);
    const ends = arcEnds(s);
    close(ends.start, { x: 0, y: 0 }, 1e-9);
    close(ends.end, { x: 200, y: 0 }, 1e-9);
    // left → top → right is clockwise on screen (y down) = positive sweep, half a turn
    expect(s.sweep).toBeCloseTo(Math.PI, 9);
    const r = play(
      'arc3p',
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 100, y: 30 },
      ],
      [{}, {}, { radius: 150 }],
    );
    expect(r?.kind === 'arc' && r.r).toBeCloseTo(150, 9);
    if (r?.kind === 'arc') expect(r.c.y).toBeLessThan(0);
  });

  it('centre point arc: radius, start angle and a signed sweep', () => {
    const s = play(
      'arcCenter',
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 0 },
      ],
      [{}, { radius: 100, start: 0 }, { sweep: 90 }],
    );
    expect(s?.kind).toBe('arc');
    if (s?.kind !== 'arc') return;
    close(arcEnds(s).start, { x: 100, y: 0 });
    close(arcEnds(s).end, { x: 0, y: -100 }, 1e-9);
  });

  it('centre point arc: the sweep follows the pointer past half a turn', () => {
    const placed: Placed[] = [];
    placed.push(resolveStep('arcCenter', placed, { x: 0, y: 0 }));
    placed.push(resolveStep('arcCenter', placed, { x: 100, y: 0 }));
    let sweep = 0;
    // the pointer walks clockwise on screen (y down) round to 270°
    for (const deg of [30, 90, 150, 210, 270]) {
      const a = (deg * Math.PI) / 180;
      sweep = resolveStep(
        'arcCenter',
        placed,
        { x: 100 * Math.cos(a), y: 100 * Math.sin(a) },
        {},
        sweep,
      ).sweep!;
    }
    expect(sweep).toBeCloseTo((270 * Math.PI) / 180, 9);
  });

  it('tangent arc continues the anchor smoothly', () => {
    const anchor = { p: { x: 100, y: 100 }, t: { x: 1, y: 0 } };
    const s = play('arcTangent', [anchor.p, { x: 200, y: 200 }], [], [{ anchor }]);
    expect(s?.kind).toBe('arc');
    if (s?.kind !== 'arc') return;
    close(s.c, { x: 100, y: 200 }, 1e-9);
    expect(s.r).toBeCloseTo(100, 9);
    expect(s.sweep).toBeCloseTo(Math.PI / 2, 9);
    const fixed = play(
      'arcTangent',
      [anchor.p, { x: 160, y: 130 }],
      [{}, { radius: 50, sweep: 180 }],
      [{ anchor }],
    );
    if (fixed?.kind === 'arc') {
      expect(fixed.r).toBeCloseTo(50, 9);
      close(arcEnds(fixed).end, { x: 100, y: 200 }, 1e-9);
    } else {
      expect.fail('no arc');
    }
  });

  it('measures what the fields show', () => {
    const placed = [resolveStep('rect3p', [], { x: 0, y: 0 })];
    const cur = resolveStep('rect3p', placed, { x: 0, y: -50 });
    const m = measure('rect3p', placed, cur);
    expect(m.length).toBeCloseTo(50, 9);
    expect(m.angle).toBeCloseTo(90, 9);
    expect(measure('circleCenter', placed, { p: { x: 30, y: 40 } })).toEqual({ diameter: 100 });
  });

  it('a shape of every kind for a preview', () => {
    const shapes: (SketchShape | null)[] = [
      shapeOf('rect2p', [{ p: { x: 0, y: 0 } }], { p: { x: 10, y: 10 } }),
      shapeOf('arcCenter', [{ p: { x: 0, y: 0 } }], { p: { x: 10, y: 0 } }),
    ];
    expect(shapes.map((s) => s?.kind)).toEqual(['rect', 'circle']);
  });
});
