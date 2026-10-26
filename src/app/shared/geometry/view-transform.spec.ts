import {
  centered,
  clampPan,
  documentToView,
  viewToDocument,
  ViewTransform,
  zoomAround,
} from './view-transform';

describe('view-transform', () => {
  const t: ViewTransform = { zoom: 1.5, panX: 40, panY: -12 };

  it('maps document ↔ viewport both ways', () => {
    expect(documentToView(t, { x: 100, y: 200 })).toEqual({ x: 190, y: 288 });
    const back = viewToDocument(t, documentToView(t, { x: 33.3, y: 777 }));
    expect(back.x).toBeCloseTo(33.3, 9);
    expect(back.y).toBeCloseTo(777, 9);
  });

  it.each([0.25, 0.5, 0.66, 1, 2])('zooming to %s keeps the point under the anchor', (z) => {
    const anchor = { x: 321, y: 123 };
    const before = viewToDocument(t, anchor);
    const next = zoomAround(t, z, anchor);
    expect(next.zoom).toBe(z);
    const after = viewToDocument(next, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('centres the artboard', () => {
    expect(centered(1200, 800, 0.5)).toEqual({ zoom: 0.5, panX: 344, panY: 144 });
    expect(centered(600, 600, 1)).toEqual({ zoom: 1, panX: -212, panY: -212 });
    expect(centered(601, 600, 0.5)).toEqual({ zoom: 0.5, panX: 45, panY: 44 });
  });

  it('keeps part of the artboard visible', () => {
    expect(clampPan({ zoom: 1, panX: 5000, panY: -5000 }, 800, 600)).toEqual({
      zoom: 1,
      panX: 800 - 64,
      panY: 64 - 1024,
    });
    const inside = { zoom: 0.5, panX: 10, panY: 20 };
    expect(clampPan(inside, 800, 600)).toEqual(inside);
  });
});
