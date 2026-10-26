import { clampPath, clampPoint, clampTranslation } from './bounds-guard';

/** Cases from the template's `BoundsGuardTests`. */
describe('BoundsGuard (design 007 E14)', () => {
  it('clamps a point into the bounds', () => {
    const b = { x: -100, y: -50, width: 200, height: 120 };
    expect(clampPoint(b, { x: 150, y: -100 })).toEqual({ x: 100, y: -50 });
  });

  it('clamps a path per vertex', () => {
    const b = { x: -25, y: -25, width: 50, height: 50 };
    expect(
      clampPath(b, [
        { x: -60, y: 0 },
        { x: 0, y: 80 },
        { x: 40, y: -90 },
      ]),
    ).toEqual([
      { x: -25, y: 0 },
      { x: 0, y: 25 },
      { x: 25, y: -25 },
    ]);
  });

  it('limits a translation on both axes', () => {
    const b = { x: 0, y: 0, width: 200, height: 200 };
    const r = { x: 50, y: 40, width: 80, height: 80 };
    expect(clampTranslation(b, r, { x: 200, y: -150 })).toEqual({ x: 70, y: -40 });
  });

  it('keeps a translation that stays inside', () => {
    const b = { x: -200, y: -200, width: 400, height: 400 };
    const r = { x: -50, y: -50, width: 60, height: 60 };
    expect(clampTranslation(b, r, { x: 20, y: 30 })).toEqual({ x: 20, y: 30 });
  });

  it('a box partly outside (or larger) does not jump in, but cannot go further out', () => {
    const b = { x: 0, y: 0, width: 100, height: 100 };
    const r = { x: -20, y: 10, width: 50, height: 200 };
    expect(clampTranslation(b, r, { x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(clampTranslation(b, r, { x: -5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});
