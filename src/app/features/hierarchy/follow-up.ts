import { NodeRef } from '../document/icon-document';
import { IconItem } from '../document/model/selection';
import { allNodes, indexTree, isSelected, TreeNode } from './hierarchy-model';

/** A selection: nodes or icon items (design 006 E5). */
export interface Selection {
  nodes: NodeRef[];
  items: IconItem[];
}

export const EMPTY_SELECTION: Selection = { nodes: [], items: [] };

/** Group / layer indices as they are after the deleted items are gone. */
function shifted(item: IconItem, deleted: readonly IconItem[]): IconItem {
  if (item.kind === 'root') return item;
  const goneGroups = deleted.filter((d) => d.kind === 'group' && d.group < item.group).length;
  if (item.kind === 'group') return { kind: 'group', group: item.group - goneGroups };
  const goneLayers = deleted.filter(
    (d) => d.kind === 'layer' && d.group === item.group && d.layer < item.layer,
  ).length;
  return { kind: 'layer', group: item.group - goneGroups, layer: item.layer - goneLayers };
}

function selectionOf(n: TreeNode, deleted: readonly IconItem[]): Selection {
  if (n.ref) return { nodes: [n.ref], items: [] };
  if (n.item) return { nodes: [], items: [shifted(n.item, deleted)] };
  return EMPTY_SELECTION;
}

/**
 * What is selected after deleting `refs` / `items` (design 006 E9): the next sibling after the last
 * deleted row that stays, else the one before the first, else the parent. "Definitions" is not
 * selectable – its parent layer then.
 */
export function followUpSelection(
  tree: TreeNode,
  refs: readonly NodeRef[],
  items: readonly IconItem[],
): Selection {
  const all = allNodes(tree).filter((n) => isSelected(n, refs, items));
  if (!all.length) return EMPTY_SELECTION;
  // an asset in two layers shows its nodes twice: follow the first layer
  const layer = all[0].ref ? all[0].id.split('/').slice(0, 2).join('/') + '/' : '';
  const gone = all.filter((n) => n.id.startsWith(layer));
  const index = indexTree(tree);
  const isGone = (n: TreeNode) =>
    gone.some((g) => g.id === n.id) ||
    // inside a deleted row (a layer of a deleted group, a child of a deleted node)
    gone.some((g) => n.id.startsWith(`${g.id}/`));
  const last = gone[gone.length - 1];
  const first = gone[0];
  const parent = index.get(last.id)?.parent;
  if (!parent) return EMPTY_SELECTION;
  const sibs = parent.children.filter((c) => c.kind !== 'defs');
  const at = sibs.findIndex((c) => c.id === last.id);
  const next = sibs.slice(at + 1).find((c) => !isGone(c));
  if (next) return selectionOf(next, items);
  const firstAt = sibs.findIndex((c) => c.id === first.id);
  const prev = sibs
    .slice(0, firstAt < 0 ? at : firstAt)
    .reverse()
    .find((c) => !isGone(c));
  if (prev) return selectionOf(prev, items);
  let p: TreeNode | null | undefined = parent;
  while (p && (p.kind === 'defs' || isGone(p))) p = index.get(p.id)?.parent;
  return p ? selectionOf(p, items) : EMPTY_SELECTION;
}
