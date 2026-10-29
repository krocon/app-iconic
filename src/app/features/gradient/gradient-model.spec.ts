import { colorAt, paintGradient, readGradient, usersOf } from './gradient-model';

const svg = (body: string) =>
  new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${body}</svg>`,
    'image/svg+xml',
  ).documentElement;

describe('gradient model (prompt 032)', () => {
  it('reads coordinates (percent, defaults), units, spread and inherited stops via href', () => {
    const root = svg(
      '<linearGradient id="base" x2="50%" spreadMethod="repeat"><stop offset="0" stop-color="#000"/>' +
        '<stop offset="100%" style="stop-color:#fff;stop-opacity:.5"/></linearGradient>' +
        '<radialGradient id="r" xlink:href="#base" gradientUnits="userSpaceOnUse" cx="10" r="4"/>' +
        '<linearGradient id="l" href="#base" y2="1"/>' +
        '<rect id="a" fill="url(#l)"/><circle id="b" style="stroke: url(#r)"/>',
    );
    const l = readGradient(root.querySelector('#l')!)!;
    expect(l).toMatchObject({ kind: 'linear', spread: 'repeat', inherited: true });
    expect(l.coords).toEqual({ x1: 0, y1: 0, x2: 0.5, y2: 1 });
    expect(l.stops.map((s) => [s.offset, s.color, s.opacity])).toEqual([
      [0, '#000', 1],
      [1, '#fff', 0.5],
    ]);
    const r = readGradient(root.querySelector('#r')!)!;
    expect(r.units).toBe('userSpaceOnUse');
    expect(r.coords).toEqual({ cx: 10, cy: 0.5, r: 4, fx: 10, fy: 0.5 });
    expect(paintGradient(root.querySelector('#b')!, 'stroke')?.id).toBe('r');
    expect(paintGradient(root.querySelector('#a')!, 'stroke')).toBeNull();
    expect(usersOf(root, 'base')).toBe(2);
    expect(usersOf(root, 'l')).toBe(1);
  });

  it('interpolates the colour between stops', () => {
    const stops = [
      { el: null!, offset: 0, color: '#000000', opacity: 1 },
      { el: null!, offset: 1, color: '#ff0000', opacity: 0 },
    ];
    expect(colorAt(stops, 0.5)).toEqual({ color: '#800000', opacity: 0.5 });
    expect(colorAt(stops, 2)).toEqual({ color: '#ff0000', opacity: 0 });
  });
});
