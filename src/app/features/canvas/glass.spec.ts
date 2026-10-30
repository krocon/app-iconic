import { describe, expect, it } from 'vitest';
import {
  FROST,
  GLOSS_EDGE,
  glassFilter,
  groupGlass,
  hazeOpacity,
  layerGlass,
  layerGlassEffect,
} from './glass';

describe('glass approximation (prompt 077 E6)', () => {
  it('reads lighting, specular and blur-material per appearance', () => {
    expect(groupGlass({}, 'light')).toEqual({
      mode: 'combined',
      effect: { specular: true, blur: null },
    });
    const g = {
      'lighting-specializations': [
        { value: 'combined' },
        { appearance: 'dark', value: 'individual' },
      ],
      'specular-specializations': [{ appearance: 'dark', value: false }],
      'blur-material-specializations': [{ value: 0.15 }, { appearance: 'dark', value: 0.08 }],
    };
    expect(groupGlass(g, 'light')).toEqual({
      mode: 'combined',
      effect: { specular: true, blur: 0.15 },
    });
    expect(groupGlass(g, 'dark')).toEqual({
      mode: 'individual',
      effect: { specular: false, blur: 0.08 },
    });
    expect(groupGlass({ 'blur-material': null }, 'light').effect.blur).toBeNull();
    expect(layerGlass({}, 'light')).toBe(true);
    expect(
      layerGlass({ 'glass-specializations': [{ appearance: 'dark', value: false }] }, 'dark'),
    ).toBe(false);
  });

  it('haze only with blur material; who takes part decides lighting', () => {
    expect(hazeOpacity({ specular: false, blur: null })).toBe(0);
    expect(hazeOpacity({ specular: false, blur: 1 })).toBeCloseTo(FROST);
    // nothing visible: no filter at all
    expect(layerGlassEffect({ specular: false }, {}, 'light')).toBeNull();
    expect(layerGlassEffect({}, { glass: false }, 'light')).toEqual({ specular: true, blur: null });
    expect(layerGlassEffect({ lighting: 'individual' }, { glass: false }, 'light')).toBeNull();
    expect(layerGlassEffect({ lighting: 'individual' }, {}, 'light')).not.toBeNull();
  });

  it('builds the gloss edge only with specular; on a box in fractions', () => {
    const haze = glassFilter(document, 'a', { specular: false, blur: 0.5 });
    expect(haze.querySelector('feOffset')).toBeNull();
    expect([...haze.querySelectorAll('feMergeNode')].map((n) => n.getAttribute('in'))).toEqual([
      'SourceGraphic',
      'haze',
    ]);
    const shiny = glassFilter(document, 'b', { specular: true, blur: null }, { scale: 0.5 });
    expect(shiny.getAttribute('primitiveUnits')).toBe('objectBoundingBox');
    expect(shiny.querySelector('feGaussianBlur')).toBeNull();
    expect(Number(shiny.querySelector('feOffset')!.getAttribute('dy'))).toBeCloseTo(
      (GLOSS_EDGE * 0.5) / 1024,
    );
    expect([...shiny.querySelectorAll('feMergeNode')].map((n) => n.getAttribute('in'))).toEqual([
      'SourceGraphic',
      'specular',
    ]);
  });
});
