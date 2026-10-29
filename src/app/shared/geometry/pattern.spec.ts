import { apply } from './matrix';
import {
  circularPlacements,
  matrixText,
  mirrorAcross,
  rectangularPlacements,
  rotationAbout,
} from './pattern';

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x);
  expect(p.y).toBeCloseTo(y);
};

describe('patterns (prompt 049)', () => {
  it('rotates around a centre, clockwise on screen', () => {
    close(apply(rotationAbout({ x: 10, y: 10 }, 90), { x: 20, y: 10 }), 10, 20);
  });

  it('circular: a full turn spreads evenly, an angle from first to last', () => {
    const full = circularPlacements({ x: 0, y: 0 }, 4);
    expect(full).toHaveLength(3);
    close(apply(full[0], { x: 1, y: 0 }), 0, 1);
    close(apply(full[2], { x: 1, y: 0 }), 0, -1);
    const part = circularPlacements({ x: 0, y: 0 }, 3, 90);
    close(apply(part[1], { x: 1, y: 0 }), 0, 1);
    expect(circularPlacements({ x: 0, y: 0 }, 1)).toEqual([]);
  });

  it('rectangular: columns × rows without the original', () => {
    const r = rectangularPlacements(3, 2, 10, 20);
    expect(r).toHaveLength(5);
    expect(r.map((m) => [m.e, m.f])).toEqual([
      [10, 0],
      [20, 0],
      [0, 20],
      [10, 20],
      [20, 20],
    ]);
  });

  it('mirrors across a line; points on it stay', () => {
    const v = mirrorAcross({ x: 100, y: 0 }, { x: 100, y: 50 })!;
    close(apply(v, { x: 80, y: 7 }), 120, 7);
    const d = mirrorAcross({ x: 0, y: 0 }, { x: 1, y: 1 })!;
    close(apply(d, { x: 3, y: 0 }), 0, 3);
    close(apply(d, { x: 5, y: 5 }), 5, 5);
    expect(mirrorAcross({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it('writes matrix() rounded, without -0', () => {
    expect(matrixText(rotationAbout({ x: 0, y: 0 }, 180))).toBe('matrix(-1 0 0 -1 0 0)');
  });
});
