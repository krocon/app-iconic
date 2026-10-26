import { TestBed } from '@angular/core/testing';
import { viewToDocument } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from './canvas-view.store';

describe('CanvasViewStore', () => {
  let s: CanvasViewStore;
  beforeEach(() => (s = TestBed.inject(CanvasViewStore)));

  it('fits and centres on the first size and keeps it fitted until touched', () => {
    s.setViewport(700, 600);
    expect(s.view()).toEqual({ zoom: 0.5, panX: 94, panY: 44 });
    s.setViewport(1200, 1200);
    expect(s.view()).toEqual({ zoom: 1, panX: 88, panY: 88 });
    s.panBy(10, 0);
    s.setViewport(1300, 1200);
    expect(s.view()).toEqual({ zoom: 1, panX: 98, panY: 88 });
  });

  it('zooms in steps around the middle or an anchor', () => {
    s.setViewport(800, 800);
    expect(s.zoom()).toBe(0.66);
    s.zoomIn();
    expect(s.zoom()).toBe(0.75);
    s.zoomOut();
    s.zoomOut();
    expect(s.zoom()).toBe(0.5);
    const anchor = { x: 123, y: 456 };
    const before = viewToDocument(s.view(), anchor);
    s.zoomIn(anchor);
    const after = viewToDocument(s.view(), anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    s.actualSize();
    expect(s.zoom()).toBe(1);
  });

  it('zooms continuously within 25–200 %', () => {
    s.setViewport(800, 800);
    s.zoomBy(100, { x: 0, y: 0 });
    expect(s.zoom()).toBe(2);
    s.zoomBy(0.001, { x: 0, y: 0 });
    expect(s.zoom()).toBe(0.25);
  });

  it('centres at the current zoom, fit resets', () => {
    s.setViewport(800, 800);
    s.zoomTo(2);
    s.panBy(-300, 50);
    s.center();
    expect(s.view()).toEqual({ zoom: 2, panX: -624, panY: -624 });
    s.fit();
    expect(s.zoom()).toBe(0.66);
  });

  it('toggles and sets options', () => {
    expect(s.options().rulers).toBe(true);
    s.toggle('rulers');
    expect(s.options().rulers).toBe(false);
    s.set('mask', 'circle');
    s.set('appearance', 'dark');
    expect(s.options()).toMatchObject({ mask: 'circle', appearance: 'dark', crossCursor: false });
  });
});
