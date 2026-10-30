import { IconLayer } from '../../core/icon-file/icon-file.models';
import {
  AddAsset,
  AddGroup,
  AddLayer,
  AddRasterAsset,
  CompositeCommand,
  DocCommand,
  ReplaceRasterAsset,
} from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { groups, layerNames, layers, newGroup, newLayer } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';
import { layerNameFor, uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { currentGroupIndex } from '../commands/insert-target';
import { Selection } from '../hierarchy/follow-up';
import { layerAsset } from '../canvas/layer-stack';
import { fitScale, positionValue } from '../layer-transform/layer-position';

/** An image ready to become a layer: a PNG data URL (converted before, E1) or SVG markup. */
export type LayerImage =
  | { kind: 'png'; name: string; dataUrl: string; width: number; height: number }
  | { kind: 'svg'; name: string; markup: string };

export interface ImageLayerPlan {
  command: CompositeCommand;
  assetName: string;
  layerName: string;
  /** The new layer (to select it). */
  item: Extract<IconItem, { kind: 'layer' }>;
}

/** The asset base name of an imported image: its stem with `.png` / `.svg` (design 080 E1). */
export function assetBase(fileName: string, kind: LayerImage['kind']): string {
  const stem = layerNameFor(fileName.trim()) || 'image';
  return `${stem}.${kind}`;
}

/**
 * "Import Image as Layer" (prompt 080 E1–E3): a new asset and in front of the active group a new
 * layer (directly in front of a selected layer); no groups → a new group on top. An image larger
 * than the canvas gets a `position` that fits it. One undo step. Pure (reads the document).
 */
export function imageLayerPlan(
  doc: IconDocument,
  image: LayerImage,
  sel: Selection,
): ImageLayerPlan {
  const assetName = uniqueAssetName(assetBase(image.name, image.kind), [...doc.assets.keys()]);
  const layerName = uniqueLayerName(layerNameFor(assetName), layerNames(doc.iconJson));
  const layer: IconLayer = newLayer(assetName, layerName);
  if (image.kind === 'png') {
    const fit = fitScale(image.width, image.height);
    if (fit !== null) layer['position'] = positionValue(undefined, { scale: fit, tx: 0, ty: 0 });
  }
  const add =
    image.kind === 'png'
      ? new AddRasterAsset(assetName, image.dataUrl)
      : new AddAsset(assetName, image.markup);
  const group = currentGroupIndex(doc, sel);
  if (group === null) {
    return {
      command: new CompositeCommand('importImageLayer', [add, new AddGroup(newGroup(layer), 0)]),
      assetName,
      layerName,
      item: { kind: 'layer', group: 0, layer: 0 },
    };
  }
  const chosen = sel.items.find(
    (i): i is Extract<IconItem, { kind: 'layer' }> => i.kind === 'layer' && i.group === group,
  );
  const index =
    chosen && chosen.layer < layers(groups(doc.iconJson)[group]).length ? chosen.layer : 0;
  return {
    command: new CompositeCommand('importImageLayer', [add, new AddLayer(group, layer, index)]),
    assetName,
    layerName,
    item: { kind: 'layer', group, layer: index },
  };
}

/** The PNG asset a layer shows (base value), `null` for SVG layers and missing images. */
export function rasterAssetOf(doc: IconDocument, item: IconItem | null | undefined): string | null {
  if (item?.kind !== 'layer') return null;
  const layer = layers(groups(doc.iconJson)[item.group])[item.layer];
  const asset = layer ? layerAsset(doc, layer, 'light') : undefined;
  return asset?.kind === 'png' ? asset.name : null;
}

/** "Replace Image" (prompt 080 E4): new bytes for the layer's PNG, same name; `null` = not possible. */
export function replaceImageCommand(
  doc: IconDocument,
  item: IconItem | null | undefined,
  image: LayerImage,
): DocCommand | null {
  const name = rasterAssetOf(doc, item);
  if (!name || image.kind !== 'png') return null;
  if (doc.asset(name)?.dataUrl === image.dataUrl) return null;
  return new ReplaceRasterAsset(name, image.dataUrl);
}
