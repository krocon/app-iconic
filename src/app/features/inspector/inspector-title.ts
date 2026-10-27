import { IconJson } from '../../core/icon-file/icon-file.models';
import { groups, layers } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';
import { INSPECTOR_TEXTS as T } from './inspector-texts';

/** Header of the panel for a root / group / layer: its name, else "Icon" / "Group n" / "Layer". */
export function itemTitle(json: IconJson, item: IconItem): string {
  if (item.kind === 'root') return T.icon;
  const g = groups(json)[item.group];
  if (item.kind === 'group')
    return typeof g?.['name'] === 'string' ? g['name'] : T.group(item.group + 1);
  const l = layers(g)[item.layer];
  return typeof l?.name === 'string' ? l.name : T.layer;
}
