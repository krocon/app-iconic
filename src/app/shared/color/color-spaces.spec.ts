import {
  formatColor,
  formatOf,
  hsbToRgb,
  hslToRgb,
  oklchToRgb,
  parseColorFunction,
  rgbToHsb,
  rgbToHsl,
  rgbToOklch,
  writeLike,
} from './color-spaces';

const RED = { r: 255, g: 0, b: 0, a: 1 };
const close = (a: number, b: number, eps = 0.6) => Math.abs(a - b) <= eps;

describe('colour spaces (prompt 074 E1)', () => {
  it('reference values', () => {
    expect(rgbToHsl(RED)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsb(RED)).toEqual({ h: 0, s: 100, b: 100 });
    const ok = rgbToOklch(RED);
    // CSS Color 4: red = oklch(62.8% 0.2577 29.23)
    expect(close(ok.l * 100, 62.8, 0.1)).toBe(true);
    expect(close(ok.c, 0.2577, 0.001)).toBe(true);
    expect(close(ok.h, 29.23, 0.05)).toBe(true);
    const white = rgbToOklch({ r: 255, g: 255, b: 255, a: 1 });
    expect(close(white.l, 1, 1e-4) && white.c < 1e-4).toBe(true);
    expect(rgbToHsl({ r: 0, g: 128, b: 128, a: 1 }).h).toBe(180);
  });

  it('there and back', () => {
    for (const c of [
      { r: 12, g: 200, b: 99, a: 1 },
      { r: 255, g: 255, b: 0, a: 0.5 },
      { r: 30, g: 30, b: 30, a: 1 },
      { r: 0, g: 0, b: 255, a: 1 },
    ]) {
      const viaHsl = hslToRgb(rgbToHsl(c), c.a);
      const viaHsb = hsbToRgb(rgbToHsb(c), c.a);
      const viaOk = oklchToRgb(rgbToOklch(c), c.a);
      for (const back of [viaHsl, viaHsb, viaOk]) {
        expect([back.r, back.g, back.b].every((v, i) => close(v, [c.r, c.g, c.b][i]))).toBe(true);
        expect(back.a).toBe(c.a);
      }
    }
  });

  it('formats and parses every input format', () => {
    const c = { r: 255, g: 128, b: 0, a: 0.5 };
    expect(formatColor(c, 'hex')).toBe('#FF800080');
    expect(formatColor(c, 'rgb')).toBe('rgb(255 128 0 / 50%)');
    expect(formatColor(c, 'hsl')).toBe('hsl(30 100% 50% / 50%)');
    expect(formatColor(c, 'hsb')).toBe('hsb(30 100% 100% / 50%)');
    expect(formatColor(RED, 'oklch')).toBe('oklch(62.8% 0.258 29.2)');
    for (const f of ['hsl', 'hsb', 'oklch'] as const) {
      const back = parseColorFunction(formatColor(c, f))!;
      expect(close(back.r, 255) && close(back.g, 128, 1.5) && close(back.b, 0, 1.5)).toBe(true);
      expect(back.a).toBe(0.5);
    }
    expect(parseColorFunction('hsla(120, 100%, 50%, 0.25)')).toMatchObject({ g: 255, a: 0.25 });
    expect(parseColorFunction('red')).toBeNull();
  });

  it('writes in the format the value had; hex otherwise', () => {
    const c = { r: 255, g: 0, b: 0, a: 0.5 };
    expect(writeLike('#00ff00', c)).toBe('#FF000080');
    expect(writeLike('rgb(0, 1, 2)', { ...c, a: 1 })).toBe('rgb(255, 0, 0)');
    expect(writeLike('rgba(0,1,2,.3)', c)).toBe('rgba(255, 0, 0, 0.5)');
    expect(writeLike('hsl(0, 0%, 0%)', c)).toBe('hsla(0, 100%, 50%, 0.5)');
    expect(writeLike('oklch(50% 0.1 20)', { ...c, a: 1 })).toBe('#FF0000');
    expect(writeLike(null, { ...c, a: 1 })).toBe('#FF0000');
    expect(formatOf('HSL(1,2%,3%)')).toBe('hsl');
    expect(formatOf('red')).toBe('hex');
  });
});
