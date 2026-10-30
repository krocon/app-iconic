import { apply, Matrix, multiply } from './matrix';
import { boxEditMatrix, boxFrame, elementFrame, frameFields, framePoint } from './box-frame';

const rot = (deg: number, cx = 0, cy = 0): Matrix => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { a: c, b: s, c: -s, d: c, e: cx - c * cx + s * cy, f: cy - s * cx - c * cy };
};
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('box frame (prompt 062)', () => {
  const bbox = { x: 100, y: 200, width: 300, height: 100 };

  it('an unrotated element: its box, rotation 0 exact', () => {
    const f = elementFrame(bbox, { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    expect(f).toEqual({
      origin: { x: 110, y: 220 },
      width: 300,
      height: 100,
      rotation: 0,
      exact: true,
    });
    expect(frameFields(f, 'c')).toEqual({ x: 260, y: 270, width: 300, height: 100, rotation: 0 });
  });

  it('a rotated, scaled element keeps its own frame', () => {
    const m = multiply(rot(30), { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    const f = elementFrame(bbox, m);
    close(f.rotation, 30);
    close(f.width, 600);
    close(f.height, 200);
    const tl = apply(m, { x: 100, y: 200 });
    close(framePoint(f, 'tl').x, tl.x);
    close(framePoint(f, 'tl').y, tl.y);
    const br = apply(m, { x: 400, y: 300 });
    close(framePoint(f, 'br').x, br.x);
    close(framePoint(f, 'br').y, br.y);
  });

  it('a mirrored element: positive size, the frame still covers it', () => {
    const f = elementFrame(bbox, { a: -1, b: 0, c: 0, d: 1, e: 1000, f: 0 });
    close(f.width, 300);
    expect(f.exact).toBe(true);
    close(f.rotation, 0);
    close(framePoint(f, 'tl').x, 600);
  });

  it('a skewed element: the axis-parallel box, rotation not exact', () => {
    const f = elementFrame(bbox, { a: 1, b: 0, c: 0.5, d: 1, e: 0, f: 0 });
    expect(f.exact).toBe(false);
    expect(f.rotation).toBe(0);
    expect(frameFields(f, 'tl').rotation).toBeNull();
    close(f.width, 350);
  });

  it('X / Y move the reference point there', () => {
    const f = boxFrame({ x: 10, y: 10, width: 100, height: 50 });
    const m = boxEditMatrix(f, 'c', { x: 500, y: 400 })!;
    expect(apply(m, { x: 60, y: 35 })).toEqual({ x: 500, y: 400 });
    expect(boxEditMatrix(f, 'c', { x: 60 })).toBeNull();
  });

  it('width scales about the reference point; the lock keeps the ratio', () => {
    const f = boxFrame({ x: 0, y: 0, width: 100, height: 50 });
    const m = boxEditMatrix(f, 'tl', { width: 200 })!;
    expect(apply(m, { x: 100, y: 50 })).toEqual({ x: 200, y: 50 });
    const locked = boxEditMatrix(f, 'tl', { width: 200 }, true)!;
    expect(apply(locked, { x: 100, y: 50 })).toEqual({ x: 200, y: 100 });
    expect(boxEditMatrix(f, 'tl', { width: 0 })).toBeNull();
  });

  it('a rotated frame scales along its own axes (no skew)', () => {
    const f = elementFrame(bbox, rot(45));
    const m = boxEditMatrix(f, 'tl', { width: 600 })!;
    const after = elementFrame(bbox, multiply(m, rot(45)));
    close(after.rotation, 45);
    close(after.width, 600);
    close(after.height, 100);
    expect(after.exact).toBe(true);
    close(framePoint(after, 'tl').x, framePoint(f, 'tl').x);
  });

  it('rotation is absolute for one element, relative with rotateBy', () => {
    const f = elementFrame(bbox, rot(10));
    const m = boxEditMatrix(f, 'c', { rotation: 40 })!;
    const after = elementFrame(bbox, multiply(m, rot(10)));
    close(after.rotation, 40);
    close(framePoint(after, 'c').x, framePoint(f, 'c').x);
    const many = boxFrame({ x: 0, y: 0, width: 10, height: 10 });
    expect(boxEditMatrix(many, 'c', { rotation: 30 })).toBeNull();
    const by = boxEditMatrix(many, 'c', { rotateBy: 90 })!;
    const p = apply(by, { x: 10, y: 5 });
    close(p.x, 5);
    close(p.y, 10);
  });

  it('flips mirror in place', () => {
    const f = boxFrame({ x: 0, y: 0, width: 100, height: 50 });
    const h = boxEditMatrix(f, 'tl', { flipH: true })!;
    expect(apply(h, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
    const v = boxEditMatrix(f, 'tl', { flipV: true })!;
    expect(apply(v, { x: 0, y: 0 })).toEqual({ x: 0, y: 50 });
  });
});
