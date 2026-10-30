import { AddAsset, AddGroup, AddLayer, CompositeCommand } from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { groups, layerNames, newGroup, newLayer } from '../document/model/icon-json';
import { layerNameFor, uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { SVG_NS } from '../document/svg/node-ids';
import { UndoLabel } from '../document/undo/undo-texts';
import { Selection } from '../hierarchy/follow-up';
import { currentGroupIndex } from './insert-target';

/**
 * "Add › Group (SVG)" (design 008 E4; legacy `AppModel.addGroup`, Marc Kronberg): a new icon group
 * with one layer and a new asset `layer-N.svg` (1024 viewport), behind the group of the current
 * layer – `addAsset` + `addGroup` as one undo step. `content` (markup of elements) goes into the
 * new asset, so that a shape added to a document without layers is one step, too (E2 rule 5).
 */
export interface IconGroupPlan {
  command: CompositeCommand;
  /** Index of the new group in `icon.json`. */
  group: number;
  asset: string;
  layer: string;
}

export function emptyLayerSvg(content = ''): string {
  return (
    `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" ` +
    `viewBox="0 0 1024 1024">\n${content}</svg>\n`
  );
}

export function iconGroupPlan(
  doc: IconDocument,
  sel: Selection,
  label: UndoLabel = 'addGroup',
  content = '',
): IconGroupPlan {
  const count = groups(doc.iconJson).length;
  const asset = uniqueAssetName(`layer-${count + 1}.svg`, [...doc.assets.keys()]);
  const layer = uniqueLayerName(layerNameFor(asset), layerNames(doc.iconJson));
  const current = currentGroupIndex(doc, sel);
  const group = current === null ? 0 : Math.min(current + 1, count);
  const command = new CompositeCommand(label, [
    new AddAsset(asset, emptyLayerSvg(content)),
    new AddGroup(newGroup(newLayer(asset, layer)), group),
  ]);
  return { command, group, asset, layer };
}

export interface LayerPlan {
  command: CompositeCommand;
  group: number;
  layer: number;
}

/**
 * "Add › Layer (SVG)" (prompt 072 E4): a new layer with an empty asset in the current group (the
 * selection's, else the first editable one), in front of the selected layer, else on top;
 * `null` without a group (then "Group (SVG)" makes one).
 */
export function layerPlan(doc: IconDocument, sel: Selection): LayerPlan | null {
  const group = currentGroupIndex(doc, sel);
  if (group === null) return null;
  const item = sel.items.find((i) => i.kind === 'layer' && i.group === group);
  const layer = item && item.kind === 'layer' ? item.layer : 0;
  const asset = uniqueAssetName(`layer-${layerNames(doc.iconJson).length + 1}.svg`, [
    ...doc.assets.keys(),
  ]);
  const name = uniqueLayerName(layerNameFor(asset), layerNames(doc.iconJson));
  const command = new CompositeCommand('addLayer', [
    new AddAsset(asset, emptyLayerSvg()),
    new AddLayer(group, newLayer(asset, name), layer),
  ]);
  return { command, group, layer };
}
