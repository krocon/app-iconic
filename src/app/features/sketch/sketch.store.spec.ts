import { TestBed } from '@angular/core/testing';
import { SketchStore } from './sketch.store';

describe('SketchStore (design 019 E3–E6)', () => {
  let store: SketchStore;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(SketchStore);
  });

  it('switches a tool on and off; one tool at a time', () => {
    store.toggle('rect2p');
    expect(store.tool()).toBe('rect2p');
    store.toggle('line');
    expect(store.tool()).toBe('line');
    store.toggle('line');
    expect(store.tool()).toBeNull();
  });

  it('places steps; the last one gives the shape and ends the tool', () => {
    store.toggle('rect2p');
    expect(store.fields()).toEqual([]);
    expect(store.place({ x: 10, y: 10 })).toBeNull();
    expect(store.fields()).toEqual(['width', 'height']);
    store.move({ x: 30, y: 50 });
    expect(store.values()).toEqual({ width: 20, height: 40 });
    const r = store.place({ x: 30, y: 50 });
    expect(r?.shape).toEqual({ kind: 'rect', c: { x: 20, y: 30 }, w: 20, h: 40, angle: 0 });
    expect(store.placed()).toEqual([]);
    expect(store.tool()).toBeNull();
  });

  it('polygon: sides first (6), typed sides stay for the next polygon; invalid ones do not', () => {
    store.toggle('polygonInscribed');
    store.place({ x: 0, y: 0 });
    expect(store.fields()).toEqual(['sides', 'diameter', 'angle']);
    store.move({ x: 10, y: 0 });
    expect(store.values()).toMatchObject({ sides: 6, diameter: 20, angle: 0 });
    store.setLock('sides', 5);
    const r = store.place();
    expect(r?.shape).toMatchObject({ kind: 'polygon', sides: 5 });
    store.toggle('polygonCircumscribed');
    store.place({ x: 0, y: 0 });
    store.move({ x: 0, y: 30 });
    expect(store.values().sides).toBe(5);
    expect(store.locks()).toEqual({});
  });

  it('typed values are fixed until cleared; the pointer gives the rest', () => {
    store.toggle('rect3p');
    store.place({ x: 0, y: 0 });
    store.move({ x: 50, y: 0 });
    store.setLock('length', 200);
    expect(store.values().length).toBe(200);
    expect(store.current()!.p.x).toBeCloseTo(200, 9);
    store.place();
    expect(store.locks()).toEqual({});
    store.move({ x: 100, y: 77 });
    store.setLock('height', 100);
    expect(store.values().height).toBe(100);
    const r = store.place();
    expect(r?.shape.kind).toBe('rect');
    if (r?.shape.kind === 'rect') {
      expect(r.shape.w).toBeCloseTo(200, 9);
      expect(r.shape.h).toBeCloseTo(100, 9);
    }
    store.toggle('rect3p');
    store.place({ x: 0, y: 0 });
    store.setLock('length', 5);
    store.setLock('length', null);
    expect(store.locks()).toEqual({});
  });

  it('a shape of no size (double click, 0 typed) is not placed; the step stays', () => {
    store.toggle('line');
    store.place({ x: 5, y: 5 });
    expect(store.place({ x: 5, y: 5 })).toBeNull();
    expect(store.placed().length).toBe(1);
    store.setLock('length', 0);
    expect(store.place({ x: 50, y: 5 })).toBeNull();
    store.setLock('length', 10);
    expect(store.place({ x: 50, y: 5 })?.shape.kind).toBe('line');
  });

  it('Esc drops the shape first, then the tool', () => {
    store.toggle('line');
    store.place({ x: 0, y: 0 });
    expect(store.escape()).toBe(true);
    expect(store.placed()).toEqual([]);
    expect(store.tool()).toBe('line');
    expect(store.escape()).toBe(true);
    expect(store.tool()).toBeNull();
    expect(store.escape()).toBe(false);
  });

  it('pick steps take the target under the pointer', () => {
    store.toggle('circle2t');
    const line = (key: string, y: number) => ({
      key,
      tangent: { kind: 'line' as const, p: { x: 0, y }, d: { x: 1, y: 0 } },
      draw: { kind: 'segment' as const, a: { x: 0, y }, b: { x: 100, y } },
    });
    store.setTargets({ targets: [line('a', 0), line('b', 100)], anchors: [] });
    store.move({ x: 50, y: 40 });
    expect(store.hover()).toBeNull();
    store.move({ x: 50, y: 3 });
    expect((store.hover() as { key: string }).key).toBe('a');
    store.place({ x: 50, y: 3 });
    // the same target is not picked twice
    store.move({ x: 50, y: 2 });
    expect(store.hover()).toBeNull();
    store.place({ x: 50, y: 98 });
    expect(store.picked().map((t) => t.key)).toEqual(['a', 'b']);
    store.move({ x: 50, y: 50 });
    expect(store.values().diameter).toBeCloseTo(100, 9);
  });
});
