import { assetPlacement, layerTransform } from './asset-placement';

const svg = (attrs: string) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}/>`,
    'image/svg+xml',
  ).documentElement;

describe('asset-placement', () => {
  it.each([
    [
      'width="1024" height="1024" viewBox="0 0 1024 1024"',
      { x: 0, y: 0, width: 1024, height: 1024 },
    ],
    [
      'width="1014" height="1024" viewBox="0 0 1014 1024"',
      { x: 5, y: 0, width: 1014, height: 1024 },
    ],
    ['viewBox="0 0 500 500"', { x: 262, y: 262, width: 500, height: 500 }],
    ['width="200px" viewBox="0 0 100 50"', { x: 412, y: 462, width: 200, height: 100 }],
    ['height="100" viewBox="0,0,100,50"', { x: 412, y: 462, width: 200, height: 100 }],
    ['', { x: 0, y: 0, width: 1024, height: 1024 }],
    ['width="100%" height="100%"', { x: 0, y: 0, width: 1024, height: 1024 }],
    ['width="10mm" viewBox="0 0 512 512"', { x: 256, y: 256, width: 512, height: 512 }],
  ])('%s → centred, unscaled', (attrs, rect) => {
    expect(assetPlacement(svg(attrs))).toEqual(rect);
  });

  it('turns a layer position into a transform around the centre', () => {
    expect(layerTransform({})).toBeNull();
    expect(layerTransform({ position: { scale: 1, 'translation-in-points': [0, 0] } })).toBeNull();
    expect(layerTransform({ position: { scale: 0.5, 'translation-in-points': [10, -20] } })).toBe(
      'translate(522 492) scale(0.5) translate(-512 -512)',
    );
    expect(layerTransform({ position: { 'translation-in-points': 'x' } })).toBeNull();
  });
});
