import {
  clampZoom,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoomStep,
  prevZoomStep,
  ZOOM_STEPS,
  zoomPercent,
} from './zoom-steps';

describe('zoom-steps', () => {
  it('has the legacy steps with 100 % at index 5', () => {
    expect(ZOOM_STEPS.map((s) => Math.round(s * 100))).toEqual([
      25, 33, 50, 66, 75, 100, 125, 150, 200,
    ]);
    expect(ZOOM_STEPS[5]).toBe(1);
  });

  it('steps up and down, also from values between the steps', () => {
    expect(nextZoomStep(1)).toBe(1.25);
    expect(prevZoomStep(1)).toBe(0.75);
    expect(nextZoomStep(0.8)).toBe(1);
    expect(prevZoomStep(0.8)).toBe(0.75);
    expect(nextZoomStep(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(prevZoomStep(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(nextZoomStep(0.3300000001)).toBe(0.5);
  });

  it('clamps', () => {
    expect(clampZoom(10)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.25);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('fits the artboard with a margin, never above 100 %', () => {
    expect(fitZoom(2000, 2000)).toBe(1);
    expect(fitZoom(1088, 1088)).toBe(1);
    expect(fitZoom(1087, 2000)).toBe(0.75);
    expect(fitZoom(600, 900)).toBe(0.5);
    expect(fitZoom(100, 100)).toBe(0.25);
  });

  it('formats percent', () => {
    expect(zoomPercent(0.66)).toBe('66 %');
    expect(zoomPercent(1.374)).toBe('137 %');
  });
});
