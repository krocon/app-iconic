import { cssColor, parseIconColor, shift } from './icon-color';

describe('icon-color', () => {
  it.each([
    ['extended-srgb:0.00000,0.53333,1.00000,1.00000', 'color(srgb 0 0.53333 1 / 1)'],
    ['srgb:1,0,0,0.5', 'color(srgb 1 0 0 / 0.5)'],
    ['srgb:1,0,0', 'color(srgb 1 0 0 / 1)'],
    ['display-p3:0.99799,0.62558,0.32982,1.00000', 'color(display-p3 0.99799 0.62558 0.32982 / 1)'],
    ['gray:0.5,1', 'color(srgb 0.5 0.5 0.5 / 1)'],
    ['extended-gray:0.25', 'color(srgb 0.25 0.25 0.25 / 1)'],
    ['extended-srgb:1.2,-0.1,0.5,1', 'color(srgb 1.2 -0.1 0.5 / 1)'],
    [' Display-P3 : 0, 0, 0, 2 ', 'color(display-p3 0 0 0 / 1)'],
  ])('%s → %s', (input, css) => {
    expect(cssColor(parseIconColor(input)!)).toBe(css);
  });

  it.each([
    [42],
    ['#ff0000'],
    ['srgb:1,0'],
    ['srgb:1,0,0,1,1'],
    ['gray:1,1,1'],
    ['hsv:1,1,1'],
    ['srgb:a,b,c'],
    [''],
  ])('rejects %j', (input) => {
    expect(parseIconColor(input)).toBeNull();
  });

  it('shifts within 0…1', () => {
    const c = parseIconColor('srgb:0.9,0.5,0.1,1')!;
    const up = shift(c, 0.16);
    expect([up.r, up.g, up.b.toFixed(2)]).toEqual([1, 0.66, '0.26']);
    const down = shift(c, -0.14);
    expect(down.b).toBe(0);
  });
});
