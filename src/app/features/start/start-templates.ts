import { IconDocumentDto, IconJson } from '../../core/icon-file/icon-file.models';
import { MaskShape } from '../canvas/canvas-view.store';
import { IOS_GLYPH, MACOS_MARK, MACOS_PLATE, SUN_GLYPH, WATCH_GLYPH } from './template-art';

/**
 * The templates of the start screen (design 082 E7), made in TS – no bundled resource: an
 * `IconDocumentDto` without path, so a document from a template is untitled. `icon.json` uses only
 * fields seen in real files (`testdata/fixtures`, `ai-core::icon::new_icon`). Pure.
 */
export const TEMPLATE_IDS = ['ios', 'macos', 'watchos', 'lightDark'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const isTemplateId = (v: unknown): v is TemplateId =>
  typeof v === 'string' && (TEMPLATE_IDS as readonly string[]).includes(v);

/** How the start screen previews a template (export SVG options). */
export interface TemplatePreview {
  mask: MaskShape;
  frame: 'macos' | null;
}

export const TEMPLATE_PREVIEW: Record<TemplateId, TemplatePreview> = {
  ios: { mask: 'squircle', frame: null },
  macos: { mask: 'squircle', frame: 'macos' },
  watchos: { mask: 'circle', frame: null },
  lightDark: { mask: 'squircle', frame: null },
};

/** `#rrggbb` as an Icon Composer colour text (`srgb:r,g,b,a`, five decimals). */
export function srgb(hex: string, alpha = 1): string {
  const n = (i: number) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5);
  return `srgb:${n(1)},${n(3)},${n(5)},${alpha.toFixed(5)}`;
}

/** Icon Composer's orientation of a new gradient (as `DEFAULT_ORIENTATION`, 010). */
const ORIENTATION = { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } };
const gradient = (a: string, b: string) => ({
  'linear-gradient': [srgb(a), srgb(b)],
  orientation: structuredClone(ORIENTATION),
});
const PLATFORMS = { circles: ['watchOS'], squares: 'shared' };
const SHADOW = (kind: 'neutral' | 'layer-color') => ({ kind, opacity: 0.5 });
const TRANSLUCENCY = { enabled: true, value: 0.5 };

function group(
  layers: { asset: string; extra?: Record<string, unknown> }[],
  shadow = SHADOW('neutral'),
) {
  return {
    layers: layers.map((l) => ({
      'image-name': l.asset,
      name: l.asset.replace(/\.svg$/, ''),
      ...l.extra,
    })),
    shadow,
    translucency: { ...TRANSLUCENCY },
  };
}

function build(id: TemplateId): { iconJson: IconJson; assets: Record<string, string> } {
  switch (id) {
    case 'ios':
      return {
        iconJson: {
          fill: gradient('#3d8bff', '#2a3fd6'),
          groups: [group([{ asset: 'glyph.svg' }])],
          'supported-platforms': structuredClone(PLATFORMS),
        },
        assets: { 'glyph.svg': IOS_GLYPH },
      };
    case 'macos':
      return {
        iconJson: {
          fill: gradient('#ffb35c', '#f06a1d'),
          groups: [
            group([{ asset: 'mark.svg' }], SHADOW('neutral')),
            group([{ asset: 'plate.svg' }], SHADOW('layer-color')),
          ],
          'supported-platforms': structuredClone(PLATFORMS),
        },
        assets: { 'mark.svg': MACOS_MARK, 'plate.svg': MACOS_PLATE },
      };
    case 'watchos':
      return {
        iconJson: {
          // not black (HIG watchOS: "Avoid using black for your icon's background")
          fill: { solid: srgb('#2fae7c') },
          groups: [group([{ asset: 'leaf.svg' }])],
          'supported-platforms': structuredClone(PLATFORMS),
        },
        assets: { 'leaf.svg': WATCH_GLYPH },
      };
    case 'lightDark':
      return {
        iconJson: {
          'fill-specializations': [
            { value: gradient('#8fd3ff', '#3a8ee6') },
            { appearance: 'dark', value: { solid: srgb('#16213a') } },
          ],
          groups: [
            group([
              {
                asset: 'sun.svg',
                extra: {
                  'fill-specializations': [
                    { appearance: 'dark', value: { solid: srgb('#ffd75e') } },
                  ],
                },
              },
            ]),
          ],
          'supported-platforms': structuredClone(PLATFORMS),
        },
        assets: { 'sun.svg': SUN_GLYPH },
      };
  }
}

/** A new, untitled document from template `id`. */
export function templateDocument(id: TemplateId): IconDocumentDto {
  const { iconJson, assets } = build(id);
  return {
    path: null,
    name: null,
    format: 'bundle',
    iconJson,
    assets: Object.entries(assets).map(([name, text]) => ({ name, kind: 'svg', text })),
    warnings: [],
  };
}
