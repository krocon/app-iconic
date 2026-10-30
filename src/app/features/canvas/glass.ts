import { IconGroup, IconLayer } from '../../core/icon-file/icon-file.models';
import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { Appearance, fieldFor } from './appearance';

/**
 * Liquid Glass as a visible **approximation** (prompt 077 E6) – Apple renders it on the device:
 * a gloss edge at the top inside the content (`specular`) and a soft, frosted lightening for
 * `blur-material` (the real backdrop blur would need the backdrop, which SVG filters cannot read).
 * Per layer, composited like the shadow (033 E5): `lighting: combined` = every layer of the group
 * (the layers' `glass` switches only matter for `individual`, schema), `individual` = the layers
 * with `glass`. No blur primitive and no lightening without `blur-material`: the filter stays cheap
 * while zooming, and colours are not washed out while editing. Pure.
 */

export interface GlassEffect {
  specular: boolean;
  /** `blur-material` 0…1, `null` = off. */
  blur: number | null;
}

export interface GroupGlass {
  mode: 'combined' | 'individual';
  effect: GlassEffect;
}

/** Gloss edge: thickness in canvas units, white at this opacity. */
export const GLOSS_EDGE = 6;
export const GLOSS_OPACITY = 0.45;
/** Frosted lightening: this much white for `blur-material` 1. */
export const FROST = 0.3;

const unit = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 1) : null;

/** The glass settings of a group for one appearance (Icon Composer's defaults when unset). */
export function groupGlass(group: IconGroup, appearance: Appearance): GroupGlass {
  return {
    mode:
      fieldFor(group, 'lighting', appearance, 'combined') === 'individual'
        ? 'individual'
        : 'combined',
    effect: {
      specular: fieldFor(group, 'specular', appearance, true) !== false,
      blur: unit(fieldFor(group, 'blur-material', appearance, null)),
    },
  };
}

/** Does the layer take part in the glass (`glass`, default on)? */
export function layerGlass(layer: IconLayer, appearance: Appearance): boolean {
  return fieldFor(layer, 'glass', appearance, true) !== false;
}

/** The haze opacity of an effect (0 = none). */
export function hazeOpacity(g: GlassEffect): number {
  return Math.round(FROST * (g.blur ?? 0) * 1000) / 1000;
}

/** Does the effect draw anything? */
export function glassVisible(g: GlassEffect): boolean {
  return g.specular || hazeOpacity(g) > 0;
}

/** The glass of one layer of `group` (`null` = none), `lighting` deciding who takes part. */
export function layerGlassEffect(
  group: IconGroup,
  layer: IconLayer,
  appearance: Appearance,
): GlassEffect | null {
  const g = groupGlass(group, appearance);
  if (!glassVisible(g.effect)) return null;
  return g.mode === 'combined' || layerGlass(layer, appearance) ? g.effect : null;
}

/**
 * The `<filter>` of the glass approximation in canvas units; `box` = composited on a box of the
 * canvas size (primitive units as fractions of it, times the scale), like the shadow (033 E5).
 */
export function glassFilter(
  d: Document,
  id: string,
  g: GlassEffect,
  box: { scale: number } | null = null,
): Element {
  const u = (v: number) => (box ? (v * box.scale) / CANVAS_SIZE : v);
  const el = (name: string, attrs: Record<string, string | number>) => {
    const e = d.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const filter = el('filter', {
    id,
    x: '-10%',
    y: '-10%',
    width: '120%',
    height: '120%',
    'color-interpolation-filters': 'sRGB',
    'data-kind': 'glass',
  });
  if (box) filter.setAttribute('primitiveUnits', 'objectBoundingBox');
  const merge = el('feMerge', {});
  merge.append(el('feMergeNode', { in: 'SourceGraphic' }));
  const haze = hazeOpacity(g);
  if (haze > 0) {
    filter.append(
      el('feFlood', { 'flood-color': '#fff', 'flood-opacity': haze, result: 'white' }),
      el('feComposite', { in: 'white', in2: 'SourceAlpha', operator: 'in', result: 'haze' }),
    );
    merge.append(el('feMergeNode', { in: 'haze' }));
  }
  if (g.specular) {
    // the top band of the content: its alpha minus itself moved down
    filter.append(
      el('feOffset', { in: 'SourceAlpha', dy: u(GLOSS_EDGE), result: 'down' }),
      el('feComposite', { in: 'SourceAlpha', in2: 'down', operator: 'out', result: 'rim' }),
      el('feFlood', { 'flood-color': '#fff', 'flood-opacity': GLOSS_OPACITY, result: 'gloss' }),
      el('feComposite', { in: 'gloss', in2: 'rim', operator: 'in', result: 'specular' }),
    );
    merge.append(el('feMergeNode', { in: 'specular' }));
  }
  filter.append(merge);
  return filter;
}
