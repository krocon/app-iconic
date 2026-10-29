import { TestBed } from '@angular/core/testing';
import { PenStore } from './pen.store';

describe('PenStore (prompt 042)', () => {
  let pen: PenStore;
  const c = (x: number) => ({ x, y: 0 });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    pen = TestBed.inject(PenStore);
    pen.toggle(true);
  });

  it('clicks make corners; a drag pulls symmetric handles; the first point closes', () => {
    pen.press({ x: 0, y: 0 }, c(0), 4);
    pen.release();
    pen.press({ x: 100, y: 0 }, c(100), 4);
    pen.move({ x: 120, y: 20 }, c(110), {});
    expect(pen.anchors()[1]).toEqual({
      p: { x: 100, y: 0 },
      hout: { x: 120, y: 20 },
      hin: { x: 80, y: -20 },
    });
    expect(pen.release()).toBe(false);
    pen.press({ x: 50, y: 80 }, c(200), 4);
    pen.release();
    pen.press({ x: 1, y: 1 }, c(300), 4);
    expect(pen.release()).toBe(true);
    expect(pen.result()).toMatchObject({ closed: true });
    expect(pen.result()!.anchors).toHaveLength(3);
  });

  it('a press on the last anchor makes it a corner; dragging from it pulls only a new handle', () => {
    pen.press({ x: 0, y: 0 }, c(0), 4);
    pen.release();
    pen.press({ x: 100, y: 0 }, c(100), 4);
    pen.move({ x: 120, y: 20 }, c(110), {});
    pen.release();
    pen.press({ x: 100, y: 0 }, c(200), 4);
    expect(pen.anchors()[1].hout).toBeNull();
    pen.move({ x: 100, y: 50 }, c(210), {});
    expect(pen.anchors()[1]).toMatchObject({ hout: { x: 100, y: 50 }, hin: { x: 80, y: -20 } });
    pen.release();
    expect(pen.anchors()).toHaveLength(2);
  });

  it('Shift places the next point on 45°; a small drag stays a corner; Space moves the anchor', () => {
    pen.press({ x: 0, y: 0 }, c(0), 4);
    pen.release();
    pen.press({ x: 50, y: 48 }, c(100), 4, true);
    expect(pen.anchors()[1].p.x).toBeCloseTo(pen.anchors()[1].p.y, 9);
    pen.move({ x: 60, y: 60 }, c(101), {});
    expect(pen.anchors()[1].hout).toBeNull();
    pen.setSpaceMove(true);
    pen.move({ x: 70, y: 60 }, c(120), {});
    expect(pen.anchors()[1].p.x).toBeGreaterThan(55);
    expect(pen.result()?.closed).toBe(false);
  });
});
