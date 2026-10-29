import { apply } from './matrix';
import { anchorPoint, dragAngle, dragScale, IDENTITY_SPEC, specMatrix } from './transform-ops';

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x);
  expect(p.y).toBeCloseTo(y);
};

describe('transform ops (prompt 053)', () => {
  it('rotates, scales, reflects about the pivot, then moves', () => {
    const pivot = { x: 100, y: 100 };
    close(apply(specMatrix({ ...IDENTITY_SPEC, rotate: 90 }, pivot), { x: 200, y: 100 }), 100, 200);
    close(
      apply(specMatrix({ ...IDENTITY_SPEC, sx: 2, sy: 3 }, pivot), { x: 110, y: 110 }),
      120,
      130,
    );
    close(
      apply(specMatrix({ ...IDENTITY_SPEC, reflect: 'horizontal' }, pivot), { x: 130, y: 7 }),
      70,
      7,
    );
    close(
      apply(specMatrix({ ...IDENTITY_SPEC, reflect: 'vertical' }, pivot), { x: 5, y: 130 }),
      5,
      70,
    );
    close(apply(specMatrix({ ...IDENTITY_SPEC, dx: 5, dy: -5 }, pivot), { x: 0, y: 0 }), 5, -5);
    close(apply(specMatrix(IDENTITY_SPEC, pivot), { x: 3, y: 4 }), 3, 4);
  });

  it('anchors of a box', () => {
    const b = { x: 10, y: 20, width: 100, height: 50 };
    expect(anchorPoint(b, 'tl')).toEqual({ x: 10, y: 20 });
    expect(anchorPoint(b, 'c')).toEqual({ x: 60, y: 45 });
    expect(anchorPoint(b, 'br')).toEqual({ x: 110, y: 70 });
    expect(anchorPoint(b, 't')).toEqual({ x: 60, y: 20 });
  });

  it('drag angle and scale', () => {
    const p = { x: 0, y: 0 };
    expect(dragAngle(p, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
    expect(dragAngle(p, { x: 10, y: 0 }, { x: 10, y: 3 }, 15)).toBe(15);
    expect(dragScale(p, { x: 10, y: 10 }, { x: 20, y: 5 }, false)).toEqual({ sx: 2, sy: 0.5 });
    const u = dragScale(p, { x: 10, y: 0 }, { x: 0, y: 30 }, true);
    expect(u.sx).toBeCloseTo(3);
  });
});
