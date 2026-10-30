import { isLocked } from '../lock/lock';
import { DocumentStore } from '../document/document.store';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { isDefinitionTag } from '../document/model/reorder-rules';
import { DropPosition, IconItem, TreeTarget } from '../document/model/selection';
import { paintedNodes } from './arrange-operations';

/**
 * Pure helpers of the `EditService` (split from `edit.service.ts` in prompt 033, behaviour
 * unchanged): what Select All selects, groups/layers as objects across a change, the asset a drop
 * lands in.
 */

/** Select All: every group / layer if those are selected, else the painted nodes of every layer. */
export function selectAllOf(
  doc: IconDocument,
  items: readonly IconItem[],
): { items: IconItem[] } | { nodes: NodeRef[] } {
  const gs = groups(doc.iconJson);
  if (items.some((i) => i.kind === 'group')) {
    return { items: gs.map((_, group) => ({ kind: 'group', group })) };
  }
  if (items.some((i) => i.kind === 'layer')) {
    return {
      items: gs.flatMap((g, group) =>
        layers(g).map((_, layer) => ({ kind: 'layer' as const, group, layer })),
      ),
    };
  }
  const refs: NodeRef[] = [];
  for (const a of doc.assets.values()) {
    for (const el of Array.from(a.svg?.root.children ?? [])) {
      if (!isDefinitionTag(el)) refs.push(doc.refOf(el)!);
    }
  }
  // locked nodes (guides by default) stay out, like a click and the marquee (prompt 066)
  return {
    nodes: paintedNodes(doc, refs)
      .filter((e) => !isLocked(e))
      .map((e) => doc.refOf(e)!),
  };
}

export type GroupOrLayer = object;

export function itemObject(json: Parameters<typeof groups>[0], i: IconItem): GroupOrLayer | null {
  if (i.kind === 'root') return null;
  const g = groups(json)[i.group];
  return (i.kind === 'group' ? g : layers(g)[i.layer]) ?? null;
}

export function findItem(json: Parameters<typeof groups>[0], o: GroupOrLayer): IconItem[] {
  const gs = groups(json);
  for (let g = 0; g < gs.length; g++) {
    if (gs[g] === o) return [{ kind: 'group', group: g }];
    const l = layers(gs[g]).indexOf(o as never);
    if (l >= 0) return [{ kind: 'layer', group: g, layer: l }];
  }
  return [];
}

/** The asset nodes land in (for the broken-reference check). */
export function destinationAsset(
  s: DocumentStore,
  t: TreeTarget,
  pos: DropPosition,
): string | null {
  if (t.kind === 'node') return t.ref.asset;
  if (t.kind === 'layer' && pos === 'into') {
    const name = layers(groups(s.document().iconJson)[t.group])[t.layer]?.['image-name'];
    return typeof name === 'string' ? (s.document().asset(name)?.name ?? null) : null;
  }
  return null;
}
