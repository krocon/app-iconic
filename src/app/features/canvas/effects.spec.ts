import { describe, expect, it } from 'vitest';
import {
  blendCss,
  chromaticMatrix,
  groupEffects,
  stackTransform,
  translucencyMask,
} from './effects';

describe('effects preview (design 010 E13)', () => {
  it('shadow, translucency and blend per appearance', () => {
    const g = {
      'shadow-specializations': [
        { value: { kind: 'layer-color', opacity: 0.4 } },
        { appearance: 'dark', value: { kind: 'none', opacity: 0.5 } },
      ],
      translucency: { enabled: true, value: 0.9 },
      'blend-mode': 'multiply',
    };
    expect(groupEffects(g, 'light')).toEqual({
      shadow: { kind: 'layer-color', opacity: 0.4 },
      translucency: 0.9,
      blend: 'multiply',
    });
    expect(groupEffects(g, 'dark').shadow).toBeNull();
    // nothing set: Icon Composer's defaults of a new group
    expect(groupEffects({}, 'light')).toEqual({
      shadow: { kind: 'neutral', opacity: 0.5 },
      translucency: 0.5,
      blend: null,
    });
    expect(
      groupEffects({ translucency: { enabled: false, value: 1 } }, 'light').translucency,
    ).toBeNull();
  });

  it('CSS blend modes; plus-darker has none', () => {
    expect(blendCss('soft-light')).toBe('soft-light');
    expect(blendCss('plus-darker')).toBeNull();
    expect(blendCss('normal')).toBeNull();
    expect(blendCss('weird')).toBeNull();
  });

  it('mask, matrix and the combined position', () => {
    expect(translucencyMask(0.5)).toBe(
      'linear-gradient(to bottom, rgb(0 0 0 / 1), rgb(0 0 0 / 0.75))',
    );
    expect(chromaticMatrix(0.5)).toMatch(/ 0\.5 0$/);
    expect(stackTransform({}, {}, 'light')).toBeNull();
    expect(
      stackTransform(
        { position: { scale: 1, 'translation-in-points': [10, 0] } },
        { position: { scale: 2, 'translation-in-points': [0, 0] } },
        'light',
      ),
    ).toBe(
      'translate(522 512) scale(1) translate(-512 -512) translate(512 512) scale(2) translate(-512 -512)',
    );
  });
});
