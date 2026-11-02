import { JsonValue } from '../../core/icon-file/icon-file.models';
import { IconItem } from '../document/model/selection';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { layerNameFor } from '../document/model/unique-names';
import { Selection } from '../hierarchy/follow-up';
import { ImageLayerPlan, imageLayerPlan } from '../image-layer/image-layer';
import { fitScale, TemplateImage } from '../template/template';
import { TraceSourceKind } from './trace-presets';

/** The image to trace and where it comes from. */
export interface TraceSource {
  kind: TraceSourceKind;
  image: TemplateImage;
  /** The PNG layer it shows (kind `layer`). */
  layer?: Extract<IconItem, { kind: 'layer' }>;
}

/**
 * Output units per image pixel (E13): a layer's image keeps its pixels (the traced layer takes
 * the layer's `position`), every other image is fitted into the canvas like the template – so a
 * trace lies exactly on its template.
 */
export function traceScale(source: TraceSource): number {
  return source.kind === 'layer' ? 1 : fitScale(source.image.width, source.image.height);
}

/** The stem of the traced layer: the image's name with `-traced`. */
export function tracedStem(name: string): string {
  const stem = layerNameFor(name.trim()) || 'image';
  return `${stem}-traced`;
}

/**
 * The traced SVG as a new layer (E13): in front of the source layer and with its `position`, else
 * in front of the active group like "Import Image as Layer"; one undo step "Trace Image". Pure.
 */
export function tracePlan(
  doc: IconDocument,
  source: TraceSource,
  markup: string,
  sel: Selection,
): ImageLayerPlan {
  const image = { kind: 'svg' as const, name: source.image.name, markup };
  const extras = { label: 'traceImage' as const, stem: tracedStem(source.image.name) };
  const l = source.layer;
  const layer = l ? layers(groups(doc.iconJson)[l.group])[l.layer] : undefined;
  if (l && layer) {
    const position = layer['position'] as JsonValue | undefined;
    return imageLayerPlan(
      doc,
      image,
      { nodes: [], items: [l] },
      position === undefined ? extras : { ...extras, position },
    );
  }
  return imageLayerPlan(doc, image, sel, extras);
}
