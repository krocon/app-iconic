import { describe, expect, it } from 'vitest';
import { cssOf, hexOf, isIconColor, readColor, shifted, spaceOf, withHex } from './icon-color-text';

describe('icon-color-text (design 010 E8)', () => {
  it('reads every prefix of the files', () => {
    for (const raw of [
      'display-p3:0.30980,0.03922,0.96078,1.00000',
      'extended-gray:1.00000,1.00000',
      'srgb:0.50196,0.00000,0.00000,1.00000',
      'extended-srgb:0.00000,0.53333,1.00000,1.00000',
      'gray:0.5',
    ]) {
      expect(isIconColor(raw)).toBe(true);
    }
    expect(readColor('cmyk:1,2,3,4')).toBeNull();
    expect(readColor('srgb:1,2')).toBeNull();
    expect(readColor(42)).toBeNull();
  });

  it('hex of the channels in the space of the file', () => {
    expect(hexOf('display-p3:1.00000,0.00000,0.00000,1.00000')).toBe('#FF0000');
    expect(hexOf('extended-gray:0.50000,0.50000')).toBe('#80808080');
    expect(hexOf('extended-srgb:1.2,-0.1,0.5,1')).toBe('#FF0080');
    expect(spaceOf('display-p3:1,0,0,1')).toBe('display-p3');
    expect(cssOf('display-p3:1,0,0,1')).toBe('color(display-p3 1 0 0 / 1)');
  });

  it('writes in the form it read: prefix, component count, 5 decimals', () => {
    expect(withHex('display-p3:0.30980,0.03922,0.96078,1.00000', '#ff8000')).toBe(
      'display-p3:1.00000,0.50196,0.00000,1.00000',
    );
    expect(withHex('srgb:0.1,0.2,0.3', '#000000')).toBe('srgb:0.00000,0.00000,0.00000');
    expect(withHex('extended-gray:1.00000,1.00000', '#333333')).toBe(
      'extended-gray:0.20000,1.00000',
    );
    // a grey with a hue becomes sRGB of the same kind
    expect(withHex('extended-gray:1.00000,1.00000', '#ff0000')).toBe(
      'extended-srgb:1.00000,0.00000,0.00000,1.00000',
    );
    expect(withHex('gray:0.5', '#ff0000')).toBe('srgb:1.00000,0.00000,0.00000');
    // alpha from the hex only when it has one
    expect(withHex('display-p3:0,0,0,0.25', '#ffffff')).toBe(
      'display-p3:1.00000,1.00000,1.00000,0.25000',
    );
    expect(withHex('display-p3:0,0,0,1', '#ffffff80')).toBe(
      'display-p3:1.00000,1.00000,1.00000,0.50196',
    );
    expect(withHex(null, '#000')).toBe('display-p3:0.00000,0.00000,0.00000,1.00000');
    expect(withHex('srgb:0,0,0,1', 'red')).toBeNull();
  });

  it('shifts in the same form', () => {
    expect(shifted('display-p3:0.50000,0.50000,0.50000,1.00000', -0.14)).toBe(
      'display-p3:0.36000,0.36000,0.36000,1.00000',
    );
    expect(shifted('extended-gray:0.5,1', 0.1)).toBe('extended-gray:0.60000,1.00000');
  });
});
