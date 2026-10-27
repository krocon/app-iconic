import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { Appearance, fieldFor } from './appearance';
import { layerTransform } from './asset-placement';
import { SVG_NS } from '../document/svg/node-ids';

/**
 * The preview approximation of Icon Composer's group effects (design 010 E13) – Apple's Liquid
 * Glass is not rebuilt: shadow as an SVG filter per layer, translucency as an opacity gradient,
 * blend modes as CSS `mix-blend-mode`. Values per appearance (specializations first). Pure.
 */

export interface ShadowEffect {
  kind: 'neutral' | 'layer-color';
  opacity: number;
}

export interface GroupEffects {
  shadow: ShadowEffect | null;
  /** Translucency amount when enabled (0…1). */
  translucency: number | null;
  blend: string | null;
}

/** Shadow below the layer, in canvas units (1024 = icon size): offset and blur. */
export const SHADOW_OFFSET = 12;
export const SHADOW_BLUR = 16;

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : fallback;

/** CSS `mix-blend-mode` of an Icon Composer blend mode; `null` = normal / none in CSS. */
export function blendCss(mode: unknown): string | null {
  if (typeof mode !== 'string' || mode === 'normal' || mode === 'plus-darker') return null;
  const css = [
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'soft-light',
    'hard-light',
    'difference',
    'exclusion',
    'plus-lighter',
  ];
  return css.includes(mode) ? mode : null;
}

export function groupEffects(group: IconGroup, appearance: Appearance): GroupEffects {
  const shadow = fieldFor(group, 'shadow', appearance, { kind: 'neutral', opacity: 0.5 });
  const tr = fieldFor(group, 'translucency', appearance, { enabled: true, value: 0.5 });
  const s = (typeof shadow === 'object' && shadow) || {};
  const t = (typeof tr === 'object' && tr) || {};
  const kind = (s as { kind?: unknown }).kind;
  return {
    shadow:
      kind === 'neutral' || kind === 'layer-color'
        ? { kind, opacity: num((s as { opacity?: unknown }).opacity, 0.5) }
        : null,
    translucency:
      (t as { enabled?: unknown }).enabled === true
        ? num((t as { value?: unknown }).value, 0.5)
        : null,
    blend: blendCss(fieldFor(group, 'blend-mode', appearance, 'normal')),
  };
}

/** Opacity gradient of the translucency: opaque at the top, `1 − value/2` at the bottom. */
export function translucencyMask(value: number): string {
  const bottom = Math.round((1 - value / 2) * 1000) / 1000;
  return `linear-gradient(to bottom, rgb(0 0 0 / 1), rgb(0 0 0 / ${bottom}))`;
}

/** Group position, then the layer's (both around the canvas centre), for one appearance. */
export function stackTransform(
  group: IconGroup,
  layer: IconLayer,
  appearance: Appearance,
): string | null {
  const g = layerTransform({ position: fieldFor(group, 'position', appearance, undefined) });
  const l = layerTransform({ position: fieldFor(layer, 'position', appearance, undefined) });
  return [g, l].filter((t) => t !== null).join(' ') || null;
}

/** The colour matrix that darkens the blurred layer for a chromatic shadow. */
export function chromaticMatrix(opacity: number): string {
  const d = 0.6;
  return `${d} 0 0 0 0 0 ${d} 0 0 0 0 0 ${d} 0 0 0 0 0 ${opacity} 0`;
}

/**
 * The `<filter>` of a group shadow (design 010 E13, approximation; also the export, 012 E6):
 * `feDropShadow` in black (`neutral`), or the blurred layer itself, darkened (`layer-color`). In
 * canvas units (1024 = icon), so it scales with the zoom.
 */
export function shadowFilter(d: Document, id: string, s: ShadowEffect): Element {
  const el = (name: string, attrs: Record<string, string | number>) => {
    const e = d.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const filter = el('filter', {
    id,
    x: '-25%',
    y: '-25%',
    width: '150%',
    height: '160%',
    'color-interpolation-filters': 'sRGB',
    'data-kind': s.kind,
  });
  if (s.kind === 'neutral') {
    filter.append(
      el('feDropShadow', {
        dx: 0,
        dy: SHADOW_OFFSET,
        stdDeviation: SHADOW_BLUR,
        'flood-color': '#000',
        'flood-opacity': s.opacity,
      }),
    );
  } else {
    const merge = el('feMerge', {});
    merge.append(el('feMergeNode', { in: 'shadow' }), el('feMergeNode', { in: 'SourceGraphic' }));
    filter.append(
      el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: SHADOW_BLUR, result: 'blur' }),
      el('feOffset', { in: 'blur', dy: SHADOW_OFFSET, result: 'moved' }),
      el('feColorMatrix', {
        in: 'moved',
        type: 'matrix',
        values: chromaticMatrix(s.opacity),
        result: 'shadow',
      }),
      merge,
    );
  }
  return filter;
}
