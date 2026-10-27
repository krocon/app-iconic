import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { Appearance, fieldFor } from './appearance';
import { layerTransform } from './asset-placement';

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
