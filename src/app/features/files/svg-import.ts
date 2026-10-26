import { SvgFile } from '../../core/icon-file/icon-file.models';
import { AddAsset, AddGroup, CompositeCommand } from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { layerNames, newGroup, newLayer } from '../document/model/icon-json';
import { layerNameFor, uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { parseSvg } from '../document/svg/node-ids';
import { resolveStyles } from '../document/svg/resolve-styles';
import { SanitizeKind, sanitizeSvg } from '../document/svg/sanitize-svg';

export interface SvgImport {
  command: CompositeCommand;
  assetName: string;
  layerName: string;
  /** What the cleaning removed. */
  removed: SanitizeKind[];
}

/**
 * "Import SVG…" (design 003 E15, legacy `AppModel.importSVG`): the SVG becomes a new asset, a
 * layer and a group at the end – one undo step. Foreign markup is cleaned first, then its
 * styles are resolved into attributes (E5). `null` if the file is no SVG.
 */
export function importSvg(doc: IconDocument, file: SvgFile, host?: HTMLElement): SvgImport | null {
  const svg = parseSvg(file.text);
  if (!svg) return null;
  const removed = sanitizeSvg(svg.root);
  resolveStyles(svg.root, host);
  doc.prepareSvg(svg);
  const assetName = uniqueAssetName(file.name, [...doc.assets.keys()]);
  const layerName = uniqueLayerName(layerNameFor(file.name), layerNames(doc.iconJson));
  const command = new CompositeCommand('importSvg', [
    new AddAsset(assetName, svg),
    new AddGroup(newGroup(newLayer(assetName, layerName))),
  ]);
  return { command, assetName, layerName, removed };
}
