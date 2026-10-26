import { boxHandlePoint, computeScaleFactors, oppositeAnchor, scaleAbout } from './box-math';
import { apply } from './matrix';

/** Cases from the template's `BoxSelectionMathTests`. */
describe('box math (design 007 E7)', () => {
  it('corner scaling is uniform and keeps the anchor', () => {
    const anchor = { x: 200, y: 100 };
    const initial = { x: 0, y: 0 };
    const proposed = { x: -20, y: -10 };
    const f = computeScaleFactors('topLeft', initial, anchor, proposed);
    expect(f.scaleX).toBeCloseTo(1.1, 6);
    expect(f.scaleY).toBeCloseTo(1.1, 6);
    const m = scaleAbout(anchor, f.scaleX, f.scaleY);
    expect(apply(m, anchor).x).toBeCloseTo(200, 6);
    expect(apply(m, anchor).y).toBeCloseTo(100, 6);
    expect(apply(m, initial).x).toBeCloseTo(-20, 6);
    expect(apply(m, initial).y).toBeCloseTo(-10, 6);
  });

  it('edge scaling stays on its axis', () => {
    const anchor = { x: 200, y: 50 };
    const f = computeScaleFactors('left', { x: 0, y: 50 }, anchor, { x: -40, y: 50 });
    expect(f).toEqual({ scaleX: 1.2, scaleY: 1 });
    const r = apply(scaleAbout(anchor, f.scaleX, f.scaleY), { x: 0, y: 50 });
    expect(r.x).toBeCloseTo(-40, 6);
    expect(r.y).toBeCloseTo(50, 6);
  });

  it('corner scaling clamps when flips are off, and flips when allowed', () => {
    const args = ['topLeft', { x: 0, y: 0 }, { x: 200, y: 100 }, { x: 220, y: 120 }] as const;
    const off = computeScaleFactors(...args, false, 0.05);
    expect(off.scaleX).toBeCloseTo(0.05, 6);
    expect(off.scaleY).toBeCloseTo(0.05, 6);
    const on = computeScaleFactors(...args, true, 0.05);
    expect(on.scaleX).toBeCloseTo(-0.2, 6);
    expect(on.scaleY).toBeCloseTo(-0.2, 6);
  });

  it('handle points and their anchors', () => {
    const r = { x: 10, y: 20, width: 100, height: 50 };
    expect(boxHandlePoint(r, 'bottomRight')).toEqual({ x: 110, y: 70 });
    expect(oppositeAnchor(r, 'bottomRight')).toEqual({ x: 10, y: 20 });
    expect(boxHandlePoint(r, 'top')).toEqual({ x: 60, y: 20 });
    expect(oppositeAnchor(r, 'top')).toEqual({ x: 60, y: 70 });
  });
});
