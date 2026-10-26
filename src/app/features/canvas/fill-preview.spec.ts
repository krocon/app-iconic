import { fillPreview, previewOf } from './fill-preview';
import { specialized } from './appearance';

const BLUE = 'extended-srgb:0.00000,0.53333,1.00000,1.00000';
const RED = 'display-p3:1,0,0,1';

describe('fill-preview', () => {
  it('automatic follows the appearance, system-* are fixed', () => {
    const light = previewOf('automatic', 'light')!;
    const dark = previewOf('automatic', 'dark')!;
    expect(light.kind).toBe('linear');
    expect(light).not.toEqual(dark);
    expect(previewOf('system-light', 'dark')).toEqual(light);
    expect(previewOf('system-dark', 'light')).toEqual(dark);
    expect(light).toMatchObject({ stops: ['color(srgb 1 1 1 / 1)', expect.any(String)] });
  });

  it('solid', () => {
    expect(previewOf({ solid: BLUE }, 'light')).toEqual({
      kind: 'solid',
      color: 'color(srgb 0 0.53333 1 / 1)',
    });
  });

  it('automatic-gradient: base +16 % → −14 %, top to bottom (legacy)', () => {
    const p = previewOf({ 'automatic-gradient': BLUE }, 'light');
    expect(p).toEqual({
      kind: 'linear',
      stops: ['color(srgb 0.16 0.69333 1 / 1)', 'color(srgb 0 0.39333 0.86 / 1)'],
      start: { x: 0.5, y: 0 },
      stop: { x: 0.5, y: 1 },
    });
  });

  it('linear-gradient with and without orientation', () => {
    expect(previewOf({ 'linear-gradient': [RED, BLUE] }, 'light')).toMatchObject({
      kind: 'linear',
      stops: ['color(display-p3 1 0 0 / 1)', 'color(srgb 0 0.53333 1 / 1)'],
      start: { x: 0.5, y: 0 },
      stop: { x: 0.5, y: 1 },
    });
    const oriented = previewOf(
      {
        'linear-gradient': [RED, BLUE],
        orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } },
      },
      'light',
    );
    expect(oriented).toMatchObject({ stop: { x: 0.5, y: 0.7 } });
  });

  it('a single colour gradient has two equal stops', () => {
    expect(previewOf({ 'linear-gradient': [RED] }, 'light')).toMatchObject({
      stops: ['color(display-p3 1 0 0 / 1)', 'color(display-p3 1 0 0 / 1)'],
    });
  });

  it('radial-gradient: centre and radius from the orientation, else legacy defaults', () => {
    expect(previewOf({ 'radial-gradient': [RED, BLUE] }, 'light')).toMatchObject({
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: 0.75,
    });
    const p = previewOf(
      {
        'radial-gradient': [RED, BLUE],
        orientation: { start: { x: 0.2, y: 0.2 }, stop: { x: 0.5, y: 0.6 } },
      },
      'light',
    );
    expect(p).toMatchObject({ center: { x: 0.2, y: 0.2 } });
    expect(p?.kind === 'radial' && p.radius).toBeCloseTo(0.5, 9);
  });

  it('fill-specializations win over fill, matching appearance first', () => {
    const icon = {
      fill: { solid: RED },
      'fill-specializations': [
        { value: { solid: BLUE } },
        { appearance: 'dark', value: 'automatic' },
      ],
    };
    expect(fillPreview(icon, 'light').preview).toEqual({
      kind: 'solid',
      color: 'color(srgb 0 0.53333 1 / 1)',
    });
    expect(fillPreview(icon, 'dark').preview).toEqual(previewOf('automatic', 'dark'));
  });

  it('missing fill = automatic; unknown fill = automatic, flagged', () => {
    expect(fillPreview({}, 'light')).toEqual({
      preview: previewOf('automatic', 'light'),
      known: true,
    });
    expect(fillPreview({ fill: { 'x-future': 1 } }, 'dark')).toEqual({
      preview: previewOf('automatic', 'dark'),
      known: false,
    });
    expect(fillPreview({ fill: { solid: 'nope' } }, 'light').known).toBe(false);
    expect(fillPreview({ fill: 'none' }, 'light').preview).toEqual({ kind: 'none' });
  });

  it('specialized() picks exact, then plain, then the fallback', () => {
    expect(specialized(undefined, 'dark', 1)).toBe(1);
    expect(specialized([{ appearance: 'dark', value: 2 }], 'light', 1)).toBe(1);
    expect(specialized([{ value: 3 }, { appearance: 'dark', value: 2 }], 'dark', 1)).toBe(2);
    expect(specialized(['junk', { value: 3 }], 'light', 1)).toBe(3);
  });
});
