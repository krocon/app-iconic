import { IconJson, IconLayer } from '../../core/icon-file/icon-file.models';
import {
  AddAsset,
  AddGroup,
  AddLayer,
  CompositeCommand,
  DocCommand,
  InsertNode,
  RemoveAsset,
  RemoveGroup,
  RemoveLayer,
  RemoveNode,
  InsertDefinition,
  RemoveClipPath,
} from '../document/commands';
import { duplicateClips, usedClipsAmong } from '../clip/clip-references';
import { isDefinitionElement } from '../document/model/reorder-rules';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layerNames, layers } from '../document/model/icon-json';
import { topLevelElements } from '../document/model/reorder-rules';
import { IconItem } from '../document/model/selection';
import { uniqueAssetName, uniqueLayerName } from '../document/model/unique-names';
import { serializeAsset, stripInternal } from '../document/svg/node-ids';
import { collectIds, renameCollidingIds } from '../document/svg/svg-references';
import { Selection } from './follow-up';

/**
 * Delete and Duplicate of the selection as document commands (design 006 E9, E10). Pure: builds
 * commands, changes nothing. `null` = nothing to do.
 */

type GroupItem = Extract<IconItem, { kind: 'group' }>;
type LayerItem = Extract<IconItem, { kind: 'layer' }>;

const groupItems = (items: readonly IconItem[]) =>
  items.filter((i): i is GroupItem => i.kind === 'group');
const layerItems = (items: readonly IconItem[]) =>
  items.filter((i): i is LayerItem => i.kind === 'layer');

/** Every image name a layer refers to (`image-name` and its specializations). */
export function imageNames(layer: IconLayer): string[] {
  const out: string[] = [];
  if (typeof layer['image-name'] === 'string') out.push(layer['image-name']);
  const specs = layer['image-name-specializations'];
  if (Array.isArray(specs)) {
    for (const s of specs) {
      const v = (s as { value?: unknown } | null)?.value;
      if (typeof v === 'string') out.push(v);
    }
  }
  return out;
}

/** Asset names the layers of `json` use (as the document names them). */
function usedAssets(doc: IconDocument, json: IconJson): Set<string> {
  const out = new Set<string>();
  for (const g of groups(json)) {
    for (const l of layers(g)) {
      for (const n of imageNames(l)) {
        const a = doc.asset(n);
        if (a) out.add(a.name);
      }
    }
  }
  return out;
}

/** Assets used before but not after removing layers (design 006 E9, question 3). */
function orphans(doc: IconDocument, after: IconJson): RemoveAsset[] {
  const before = usedAssets(doc, doc.iconJson);
  const still = usedAssets(doc, after);
  return [...before].filter((n) => !still.has(n)).map((n) => new RemoveAsset(n));
}

/** `icon.json` without the given groups / layers (to find orphans). */
function without(json: IconJson, gs: readonly GroupItem[], ls: readonly LayerItem[]): IconJson {
  const kept = groups(json)
    .map((g, gi) =>
      gs.some((x) => x.group === gi)
        ? null
        : {
            ...g,
            layers: layers(g).filter((_, li) => !ls.some((x) => x.group === gi && x.layer === li)),
          },
    )
    .filter((g) => g !== null);
  return { ...json, groups: kept };
}

/** The nodes that can be deleted: the top-level ones, never an asset root. */
export function deletableNodes(doc: IconDocument, refs: readonly NodeRef[]): Element[] {
  return topLevelElements(doc, refs).filter((e) => e.parentElement !== null);
}

/** Clip paths among / inside the nodes to delete that other elements still use (design 014 E10). */
export function usedClipsToDelete(doc: IconDocument, refs: readonly NodeRef[]): Element[] {
  const els = deletableNodes(doc, refs);
  const byAsset = new Map<string, Element[]>();
  for (const el of els) {
    const a = doc.refOf(el)!.asset;
    byAsset.set(a, [...(byAsset.get(a) ?? []), el]);
  }
  return [...byAsset].flatMap(([a, list]) => usedClipsAmong(list, doc.assets.get(a)!.svg!.root));
}

export function deleteCommand(doc: IconDocument, sel: Selection): DocCommand | null {
  if (sel.nodes.length) {
    const els = deletableNodes(doc, sel.nodes);
    const used = usedClipsToDelete(doc, sel.nodes);
    // painting nodes first, then used clips with their references, then the other definitions
    const painting = els.filter((e) => !isDefinitionElement(e));
    const rest = els.filter((e) => isDefinitionElement(e) && !used.includes(e));
    const cmds: DocCommand[] = [
      ...painting.map((el) => new RemoveNode(doc.refOf(el)!)),
      ...used.map((c) => new RemoveClipPath(doc.refOf(c)!)),
      ...rest.map((el) => new RemoveNode(doc.refOf(el)!)),
    ];
    return cmds.length ? new CompositeCommand('delete', cmds) : null;
  }
  const gs = groupItems(sel.items).sort((a, b) => b.group - a.group);
  const ls = layerItems(sel.items)
    .filter((l) => !gs.some((g) => g.group === l.group))
    .sort((a, b) => b.group - a.group || b.layer - a.layer);
  if (!gs.length && !ls.length) return null;
  const cmds: DocCommand[] = [
    // layers first: removing a group shifts the indices of the groups after it
    ...ls.map((l) => new RemoveLayer(l.group, l.layer)),
    ...gs.map((g) => new RemoveGroup(g.group)),
    ...orphans(doc, without(doc.iconJson, gs, ls)),
  ];
  return new CompositeCommand('delete', cmds);
}

/** A command plus the selection it leads to (known after it ran). */
export interface Planned {
  command: DocCommand;
  selection(): Selection;
}

/**
 * Markup of a copy of `el` with ids that do not clash in its asset; clips it refers to from
 * outside are copied with new ids (design 014 E10) – their markup in `clips`.
 */
function cloneMarkup(
  el: Element,
  root: Element,
  taken: Set<string>,
): { markup: string; clips: string[] } {
  const copy = el.cloneNode(true) as Element;
  stripInternal(copy);
  renameCollidingIds([copy], taken);
  const clips = duplicateClips(el, copy, root, taken);
  return { markup: new XMLSerializer().serializeToString(copy), clips };
}

function duplicateNodes(doc: IconDocument, refs: readonly NodeRef[]): Planned | null {
  const els = deletableNodes(doc, refs);
  if (!els.length) return null;
  const taken = new Map<string, Set<string>>();
  const defs: InsertDefinition[] = [];
  const inserts = [...els].reverse().map((el) => {
    const ref = doc.refOf(el)!;
    const root = doc.assets.get(ref.asset)!.svg!.root;
    const ids = taken.get(ref.asset) ?? collectIds(root);
    taken.set(ref.asset, ids);
    const parent = el.parentElement!;
    const index = Array.prototype.indexOf.call(parent.children, el) as number;
    const { markup, clips } = cloneMarkup(el, root, ids);
    defs.push(...clips.map((c) => new InsertDefinition(ref.asset, c, 'clone')));
    return new InsertNode(doc.refOf(parent)!, markup, index + 1, 'clone');
  });
  return {
    // the clip copies last: a new <defs> at the root must not shift the indices of the inserts
    command: new CompositeCommand('clone', [...inserts, ...defs]),
    selection: () => ({
      nodes: inserts.reverse().flatMap((i) => (i.ref ? [i.ref] : [])),
      items: [],
    }),
  };
}

/**
 * A copy of a layer with a copy of its SVG asset (design 006 E10: editing the copy must not change
 * the original). PNG and other assets are shared.
 */
function layerCopy(
  doc: IconDocument,
  layer: IconLayer,
  names: { assets: string[]; layers: string[] },
): { layer: IconLayer; asset: AddAsset | null } {
  const name = layer['image-name'];
  const svg = typeof name === 'string' ? doc.asset(name)?.svg : undefined;
  const label = typeof layer.name === 'string' ? layer.name : 'layer';
  const layerName = uniqueLayerName(label, names.layers);
  names.layers.push(layerName);
  if (!svg || typeof name !== 'string')
    return { layer: { ...layer, name: layerName }, asset: null };
  const assetName = uniqueAssetName(doc.asset(name)!.name, names.assets);
  names.assets.push(assetName);
  return {
    layer: { ...layer, 'image-name': assetName, name: layerName },
    asset: new AddAsset(assetName, serializeAsset(svg)),
  };
}

function duplicateItems(doc: IconDocument, items: readonly IconItem[]): Planned | null {
  const names = { assets: [...doc.assets.keys()], layers: layerNames(doc.iconJson) };
  const gs = groupItems(items).sort((a, b) => a.group - b.group);
  const all = groups(doc.iconJson);
  const cmds: DocCommand[] = [];
  let select: IconItem[];
  if (gs.length) {
    const copies = gs.map((g) => {
      const copied = layers(all[g.group]).map((l) => layerCopy(doc, l, names));
      cmds.push(...copied.flatMap((c) => (c.asset ? [c.asset] : [])));
      return { at: g.group, group: { ...all[g.group], layers: copied.map((c) => c.layer) } };
    });
    // from the back, so that earlier positions stay valid
    for (const c of [...copies].reverse()) cmds.push(new AddGroup(c.group, c.at + 1));
    select = gs.map((g, k): IconItem => ({ kind: 'group', group: g.group + k + 1 }));
  } else {
    const ls = layerItems(items).sort((a, b) => a.group - b.group || a.layer - b.layer);
    if (!ls.length) return null;
    const copies = ls.map((l) => ({ l, c: layerCopy(doc, layers(all[l.group])[l.layer], names) }));
    cmds.push(...copies.flatMap(({ c }) => (c.asset ? [c.asset] : [])));
    for (const { l, c } of [...copies].reverse())
      cmds.push(new AddLayer(l.group, c.layer, l.layer + 1));
    select = ls.map((l): IconItem => {
      const before = ls.filter((o) => o.group === l.group && o.layer < l.layer).length;
      return { kind: 'layer', group: l.group, layer: l.layer + before + 1 };
    });
  }
  return {
    command: new CompositeCommand('clone', cmds),
    selection: () => ({ nodes: [], items: select }),
  };
}

/** Duplicate (⌘D): copies right after the originals, selected afterwards. */
export function duplicateCommand(doc: IconDocument, sel: Selection): Planned | null {
  return sel.nodes.length ? duplicateNodes(doc, sel.nodes) : duplicateItems(doc, sel.items);
}
