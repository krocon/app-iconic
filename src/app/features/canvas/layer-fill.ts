import { IconLayer } from '../../core/icon-file/icon-file.models';
import { SVG_NS } from '../document/svg/node-ids';
import { CANVAS_SIZE } from '../../shared/geometry/icon-guides';
import { Appearance, fieldFor } from './appearance';
import { FillPreview, previewOf } from './fill-preview';
import { cssColor, IconColor } from './icon-color';

/**
 * The fill of a layer (prompt 077 E1): `automatic`, `none` and anything not understood show the
 * asset's own colours (schema: "'automatic' and 'none' both render the asset's natural colors");
 * a colour or gradient paints the layer – its content is the alpha mask. Gradients lie in the
 * layer's space: the 1024 area after group and layer `position` (assumption, question 2). Pure.
 */

/** `null` = the asset's natural colours. */
export type LayerFill = FillPreview<IconColor> | null;

const same = (c: IconColor) => c;

/** The fill of `layer` for `appearance` (`fill-specializations` first). */
export function layerFillOf(layer: IconLayer, appearance: Appearance): LayerFill {
  const fill = fieldFor(layer, 'fill', appearance, 'automatic');
  if (fill === 'automatic' || fill === 'none') return null;
  const p = previewOf(fill, appearance, same);
  return p && p.kind !== 'none' ? p : null;
}

type Gradient<C> = Extract<FillPreview<C>, { kind: 'linear' | 'radial' }>;

/** A big rect in layer space: content outside the 1024 area is coloured as well. */
export const FILL_RECT = {
  x: -CANVAS_SIZE,
  y: -CANVAS_SIZE,
  width: 3 * CANVAS_SIZE,
  height: 3 * CANVAS_SIZE,
};

function el(d: Document, name: string, attrs: Record<string, string | number | null>): Element {
  const e = d.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null) e.setAttribute(k, String(v));
  return e;
}

/**
 * A gradient of a fill in canvas units (`userSpaceOnUse`, unit points × 1024) – the same for the
 * canvas and the export; `stop` gives the colour attributes of one stop.
 */
export function gradientElement<C>(
  d: Document,
  id: string,
  fill: Gradient<C>,
  stop: (c: C) => Record<string, string | number | null>,
): Element {
  const s = CANVAS_SIZE;
  const grad =
    fill.kind === 'linear'
      ? el(d, 'linearGradient', {
          x1: fill.start.x * s,
          y1: fill.start.y * s,
          x2: fill.stop.x * s,
          y2: fill.stop.y * s,
        })
      : el(d, 'radialGradient', {
          cx: fill.center.x * s,
          cy: fill.center.y * s,
          r: fill.radius * s,
        });
  grad.setAttribute('id', id);
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  const n = fill.stops.length;
  fill.stops.forEach((c, i) =>
    grad.append(el(d, 'stop', { offset: n > 1 ? i / (n - 1) : 0, ...stop(c) })),
  );
  return grad;
}

/** The gradient of a layer fill as an SVG image (data URL) of the canvas: for `feImage`. */
export function gradientImage(fill: Gradient<IconColor>, transform: string | null): string {
  const d = document.implementation.createDocument(SVG_NS, 'svg', null);
  const root = d.documentElement;
  for (const [k, v] of Object.entries({
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    viewBox: `0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`,
    preserveAspectRatio: 'none',
  })) {
    root.setAttribute(k, String(v));
  }
  const defs = el(d, 'defs', {});
  defs.append(gradientElement(d, 'g', fill, (c) => ({ style: `stop-color:${cssColor(c)}` })));
  const g = el(d, 'g', { transform });
  g.append(el(d, 'rect', { ...FILL_RECT, fill: 'url(#g)' }));
  root.append(defs, g);
  return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(d))}`;
}

/**
 * The canvas filter of a layer fill (prompt 077 E1): on the layer's `<svg>` box (the canvas, as
 * the composited shadow, 033 E5) – the paint (`feFlood`, or the gradient as `feImage`) inside the
 * layer's alpha (`feComposite in`). The live root stays painted and hit-testable.
 */
export function layerFillFilter(
  d: Document,
  id: string,
  fill: NonNullable<LayerFill>,
  transform: string | null,
): Element {
  const filter = el(d, 'filter', {
    id,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    primitiveUnits: 'objectBoundingBox',
    'color-interpolation-filters': 'sRGB',
    'data-kind': 'fill',
  });
  if (fill.kind === 'solid') {
    filter.append(el(d, 'feFlood', { 'flood-color': cssColor(fill.color), result: 'paint' }));
  } else if (fill.kind !== 'none') {
    const img = el(d, 'feImage', {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      preserveAspectRatio: 'none',
      result: 'paint',
    });
    img.setAttribute('href', gradientImage(fill, transform));
    filter.append(img);
  }
  filter.append(el(d, 'feComposite', { in: 'paint', in2: 'SourceGraphic', operator: 'in' }));
  return filter;
}
