import { isImageDataUrl, svgDataUrlSize } from './image-size';

const b64 = (s: string) => `data:image/svg+xml;base64,${btoa(s)}`;

describe('svgDataUrlSize (design 008 E8)', () => {
  it('reads width/height, else the viewBox', () => {
    expect(
      svgDataUrlSize(b64('<svg xmlns="http://www.w3.org/2000/svg" width="200px" height="100"/>')),
    ).toEqual({ width: 200, height: 100 });
    expect(
      svgDataUrlSize(b64('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"/>')),
    ).toEqual({ width: 64, height: 32 });
    expect(
      svgDataUrlSize(
        b64('<svg xmlns="http://www.w3.org/2000/svg" width="128" viewBox="0 0 64 32"/>'),
      ),
    ).toEqual({ width: 128, height: 64 });
    expect(
      svgDataUrlSize(
        `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="6"/>')}`,
      ),
    ).toEqual({ width: 5, height: 6 });
  });

  it('has no size for percentages, broken or other data', () => {
    expect(
      svgDataUrlSize(b64('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="50%"/>')),
    ).toBeNull();
    expect(svgDataUrlSize(b64('<nope'))).toBeNull();
    expect(svgDataUrlSize('data:image/svg+xml;base64,%%%')).toBeNull();
    expect(svgDataUrlSize('data:image/png;base64,AAAA')).toBeNull();
  });

  it('accepts embedded images only', () => {
    expect(isImageDataUrl('data:image/png;base64,AA')).toBe(true);
    expect(isImageDataUrl('data:image/svg+xml,<svg/>')).toBe(true);
    expect(isImageDataUrl('https://x/y.png')).toBe(false);
    expect(isImageDataUrl('data:text/html,<b>')).toBe(false);
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false);
  });
});
