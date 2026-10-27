import { FAKE_FONTS } from '../../../testing/fake-font-api';
import { centeredPath, filterFamilies, regularStyle, resolveFont } from './text-path';

describe('text-path helpers', () => {
  it('resolves ids, family names (without case) and styles', () => {
    expect(resolveFont(FAKE_FONTS, 'FakeSans-Bold')?.id).toBe('FakeSans-Bold');
    expect(resolveFont(FAKE_FONTS, 'fake sans')?.id).toBe('FakeSans-Regular');
    expect(resolveFont(FAKE_FONTS, 'Fake Sans', 'italic')?.id).toBe('FakeSans-Italic');
    expect(resolveFont(FAKE_FONTS, 'Fake Sans', 'Black')).toBeNull();
    expect(resolveFont(FAKE_FONTS, 'Comic')).toBeNull();
  });

  it('the default is a preferred family, else the first', () => {
    expect(resolveFont(FAKE_FONTS)?.id).toBe('FakeSans-Regular');
    const withArial = [
      ...FAKE_FONTS,
      { family: 'Arial', styles: [{ name: 'Regular', weight: 400, italic: false, id: 'ArialMT' }] },
    ];
    expect(resolveFont(withArial)?.id).toBe('ArialMT');
    expect(resolveFont([])).toBeNull();
  });

  it('regular = upright and nearest to 400', () => {
    expect(
      regularStyle([
        { name: 'Italic', weight: 400, italic: true, id: 'a' },
        { name: 'Bold', weight: 700, italic: false, id: 'b' },
        { name: 'Light', weight: 300, italic: false, id: 'c' },
      ])?.id,
    ).toBe('c');
  });

  it('filters families', () => {
    expect(filterFamilies(FAKE_FONTS, 'serif').map((f) => f.family)).toEqual(['Fake Serif']);
    expect(filterFamilies(FAKE_FONTS, ' ').length).toBe(2);
  });

  it('centres the outlines on a point', () => {
    const r = {
      d: 'M0 -10L20 -10L20 0Z',
      bbox: { x: 0, y: -10, width: 20, height: 10 },
      advance: 22,
    };
    expect(centeredPath(r, { x: 100, y: 100 })).toBe('M90 95 L110 95 L110 105 Z');
    expect(centeredPath({ d: '', bbox: null, advance: 5 }, { x: 0, y: 0 })).toBeNull();
  });
});
