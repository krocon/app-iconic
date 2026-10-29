import { bottomIndex, readSeeds, seedsJson, stripLiveFills } from './live-fill-model';

const svg = (body: string) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
    'image/svg+xml',
  ).documentElement;

describe('live fill model (prompt 060)', () => {
  it('seeds round-trip, bad ones are skipped', () => {
    const root = svg(
      `<path data-live-fill='${seedsJson([{ x: 1.23456, y: 2 }])}'/>` +
        `<path data-live-fill='{"seeds":[[1,"x"],[3,4]]}'/><path data-live-fill='nonsense'/>`,
    );
    const [a, b, c] = Array.from(root.children);
    expect(readSeeds(a)).toEqual([{ x: 1.235, y: 2 }]);
    expect(readSeeds(b)).toEqual([{ x: 3, y: 4 }]);
    expect(readSeeds(c)).toBeNull();
    stripLiveFills(root);
    expect(root.querySelector('[data-live-fill]')).toBeNull();
  });

  it('a new fill goes below the painted children', () => {
    expect(bottomIndex(svg('<defs/><title>t</title><rect/><circle/>'))).toBe(2);
    expect(bottomIndex(svg('<defs/>'))).toBe(1);
  });
});
