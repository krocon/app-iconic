import {
  CompositeCommand,
  DocCommand,
  RemoveAttribute,
  SetAttribute,
  SetIconJsonValue,
} from '../document/commands';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';
import { elementsOf } from '../document/svg/node-ids';
import { styleValue, styleWithout } from '../document/svg/style-props';
import { Selection } from './follow-up';
import { isHiddenElement } from './hierarchy-model';

/**
 * Show / Hide (design 006 E4): nodes by `display="none"` (also `display:none` in `style` is
 * cleared when shown), groups and layers by `hidden: true` in `icon.json`. `recursive` = with
 * everything inside, all to the new state of the first target. One undo step.
 */

function nodeCommands(doc: IconDocument, el: Element, hide: boolean): DocCommand[] {
  const ref = doc.refOf(el)!;
  if (hide)
    return isHiddenElement(el)
      ? []
      : [new SetAttribute(ref, 'display', 'none', 'toggleVisibility')];
  const cmds: DocCommand[] = [];
  if (el.getAttribute('display')?.trim() === 'none') cmds.push(new RemoveAttribute(ref, 'display'));
  if (styleValue(el, 'display') === 'none') {
    const rest = styleWithout(el, 'display');
    cmds.push(
      rest
        ? new SetAttribute(ref, 'style', rest, 'toggleVisibility')
        : new RemoveAttribute(ref, 'style'),
    );
  }
  return cmds;
}

function itemHidden(doc: IconDocument, item: IconItem): boolean {
  if (item.kind === 'root') return false;
  const g = groups(doc.iconJson)[item.group];
  const v = item.kind === 'group' ? g : layers(g)[item.layer];
  return v?.['hidden'] === true;
}

function itemCommand(item: Exclude<IconItem, { kind: 'root' }>, hide: boolean): DocCommand {
  const path =
    item.kind === 'group' ? ['groups', item.group] : ['groups', item.group, 'layers', item.layer];
  return new SetIconJsonValue([...path, 'hidden'], hide ? true : undefined, 'toggleVisibility');
}

export function visibilityCommand(
  doc: IconDocument,
  sel: Selection,
  recursive = false,
): DocCommand | null {
  const cmds: DocCommand[] = [];
  if (sel.nodes.length) {
    const els = sel.nodes.map((r) => doc.node(r)).filter((e): e is Element => !!e?.parentElement);
    if (!els.length) return null;
    const hide = !isHiddenElement(els[0]);
    const all = recursive ? [...new Set(els.flatMap((e) => elementsOf(e)))] : els;
    for (const el of all) cmds.push(...nodeCommands(doc, el, hide));
  } else {
    const items = sel.items.filter(
      (i): i is Exclude<IconItem, { kind: 'root' }> => i.kind !== 'root',
    );
    if (!items.length) return null;
    const hide = !itemHidden(doc, items[0]);
    const targets = [...items];
    if (recursive) {
      for (const i of items) {
        if (i.kind !== 'group') continue;
        layers(groups(doc.iconJson)[i.group]).forEach((_, layer) => {
          if (
            !targets.some((t) => t.kind === 'layer' && t.group === i.group && t.layer === layer)
          ) {
            targets.push({ kind: 'layer', group: i.group, layer });
          }
        });
      }
    }
    for (const t of targets) if (itemHidden(doc, t) !== hide) cmds.push(itemCommand(t, hide));
  }
  return cmds.length ? new CompositeCommand('toggleVisibility', cmds) : null;
}
