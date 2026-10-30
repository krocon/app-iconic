import { describe, expect, it } from 'vitest';
import { gradientImage, layerFillFilter, layerFillOf } from './layer-fill';

const RED = 'srgb:1,0,0,1';

describe('layer fill (prompt 077 E1)', () => {
  it('automatic, none and unknown fills keep the natural colours', () => {
    expect(layerFillOf({}, 'light')).toBeNull();
    expect(layerFillOf({ fill: 'automatic' }, 'light')).toBeNull();
    expect(layerFillOf({ fill: 'none' }, 'dark')).toBeNull();
    expect(layerFillOf({ fill: { solid: 'cmyk:1,2,3,4' } }, 'light')).toBeNull();
  });

  it('a colour per appearance, tinted specializations first (evidence: Turntable.icon)', () => {
    const layer = {
      'fill-specializations': [
        { value: { solid: RED } },
        { appearance: 'tinted', value: { solid: 'extended-gray:0.70000,1.00000' } },
      ],
    };
    expect(layerFillOf(layer, 'light')).toEqual({
      kind: 'solid',
      color: { space: 'srgb', r: 1, g: 0, b: 0, a: 1 },
    });
    expect(layerFillOf(layer, 'dark')).toMatchObject({ kind: 'solid', color: { r: 1 } });
    expect(layerFillOf(layer, 'tinted')).toMatchObject({
      kind: 'solid',
      color: { r: 0.7, g: 0.7 },
    });
    // only a tinted entry (Spacedrive.icon): natural colours in light
    const only = { 'fill-specializations': [{ appearance: 'tinted', value: { solid: RED } }] };
    expect(layerFillOf(only, 'light')).toBeNull();
    expect(layerFillOf(only, 'tinted')?.kind).toBe('solid');
  });

  it('gradients in layer space', () => {
    const f = layerFillOf({ fill: { 'linear-gradient': [RED, 'srgb:0,0,1,1'] } }, 'light');
    expect(f?.kind).toBe('linear');
    const url = gradientImage(f as never, 'translate(10 0)');
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('y2="1024"');
    expect(svg).toContain('transform="translate(10 0)"');
    expect(svg).toContain('stop-color:color(srgb 1 0 0 / 1)');
  });

  it('the canvas filter: paint inside the layer alpha', () => {
    const solid = layerFillFilter(
      document,
      'f',
      layerFillOf({ fill: { solid: RED } }, 'light')!,
      null,
    );
    expect(solid.getAttribute('primitiveUnits')).toBe('objectBoundingBox');
    expect([...solid.children].map((c) => c.localName)).toEqual(['feFlood', 'feComposite']);
    expect(solid.children[0].getAttribute('flood-color')).toBe('color(srgb 1 0 0 / 1)');
    expect(solid.children[1].getAttribute('operator')).toBe('in');
    expect(solid.children[1].getAttribute('in2')).toBe('SourceGraphic');
    const grad = layerFillFilter(
      document,
      'g',
      layerFillOf({ fill: { 'automatic-gradient': RED } }, 'light')!,
      null,
    );
    expect(grad.children[0].localName).toBe('feImage');
    expect(grad.children[0].getAttribute('preserveAspectRatio')).toBe('none');
  });
});
