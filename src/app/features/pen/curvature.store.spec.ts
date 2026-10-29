import { TestBed } from '@angular/core/testing';
import { IDENTITY } from '../../shared/geometry/matrix';
import { CurvatureStore } from './curvature.store';

describe('CurvatureStore (prompt 043)', () => {
  let c: CurvatureStore;
  const cl = (x: number) => ({ x, y: 0 });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    c = TestBed.inject(CurvatureStore);
    c.toggle(true);
  });

  it('clicks place points; the curve runs through them; the first point closes', () => {
    c.press({ x: 0, y: 0 }, cl(0), 4, false);
    c.release();
    c.press({ x: 100, y: -50 }, cl(100), 4, false);
    c.release();
    c.press({ x: 200, y: 0 }, cl(200), 4, false);
    c.release();
    const r = c.result()!;
    expect(r.anchors).toHaveLength(3);
    expect(r.anchors[1].hin).not.toBeNull();
    expect(c.press({ x: 1, y: 1 }, cl(300), 4, false)).toBe('closed');
    expect(c.result()!.closed).toBe(true);
  });

  it('Alt-click toggles a corner; Backspace removes the last point', () => {
    c.press({ x: 0, y: 0 }, cl(0), 4, false);
    c.release();
    c.press({ x: 100, y: -50 }, cl(100), 4, true);
    c.release();
    c.press({ x: 200, y: 0 }, cl(200), 4, false);
    c.release();
    expect(c.points()[1].corner).toBe(true);
    c.press({ x: 100, y: -50 }, cl(300), 4, true);
    expect(c.points()[1].corner).toBe(false);
    c.release();
    c.remove();
    expect(c.points()).toHaveLength(2);
  });

  it('edits a path: drag a point, add one on the path, corner ↔ smooth, remove', () => {
    c.startEdit({
      ref: { asset: 'a.svg', id: 'n1' },
      prefix: '',
      toLocal: IDENTITY,
      anchors: [
        { p: { x: 0, y: 0 }, hin: null, hout: null },
        { p: { x: 100, y: 0 }, hin: null, hout: null },
      ],
      closed: false,
    });
    expect(c.pressEdit({ x: 50, y: 1 }, cl(0), 4, false)).toBe('changed');
    expect(c.edit()!.anchors).toHaveLength(3);
    c.move({ x: 50, y: -40 }, cl(20));
    expect(c.release()).toBe(true);
    expect(c.edit()!.anchors[1].p).toEqual({ x: 50, y: -40 });
    expect(c.toggleAt({ x: 50, y: -40 }, 4)).toBe(true);
    expect(c.edit()!.anchors[1].hin).not.toBeNull();
    expect(c.remove()).toBe(true);
    expect(c.edit()!.anchors).toHaveLength(2);
    expect(c.pressEdit({ x: 500, y: 500 }, cl(0), 4, false)).toBe('outside');
  });
});
