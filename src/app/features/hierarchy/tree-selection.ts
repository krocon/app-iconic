import { DocumentStore } from '../document/document.store';
import { IconItem, sameItem } from '../document/model/selection';
import { NodeRef } from '../document/icon-document';
import { TreeNode, TreeRow } from './hierarchy-model';

/**
 * Selection by clicks and keys in the tree (design 006 E5): single, range (from the anchor, only
 * rows of the anchor's kind), toggle. A selection holds one kind: nodes, groups, layers or root.
 */
export type RowKind = 'node' | 'group' | 'layer' | 'root';

export function rowKind(n: TreeNode): RowKind | null {
  if (n.ref) return 'node';
  if (n.item) return n.item.kind;
  return null;
}

/** Selectable rows: everything but "Definitions". */
export function selectable(n: TreeNode): boolean {
  return rowKind(n) !== null;
}

function setRows(store: DocumentStore, nodes: TreeNode[]): void {
  const refs: NodeRef[] = [];
  const items: IconItem[] = [];
  for (const n of nodes) {
    if (n.ref && !refs.some((r) => r.asset === n.ref!.asset && r.id === n.ref!.id))
      refs.push(n.ref);
    else if (n.item) items.push(n.item);
  }
  if (refs.length) store.select(refs);
  else store.selectItems(items);
}

export function selectSingle(store: DocumentStore, n: TreeNode): void {
  if (selectable(n)) setRows(store, [n]);
}

export function selectRange(
  store: DocumentStore,
  rows: readonly TreeRow[],
  anchor: number,
  to: number,
): void {
  const kind = rowKind(rows[anchor]?.node ?? rows[to].node);
  const [a, b] = anchor <= to ? [anchor, to] : [to, anchor];
  setRows(
    store,
    rows
      .slice(Math.max(0, a), b + 1)
      .map((r) => r.node)
      .filter((n) => rowKind(n) === kind),
  );
}

export function toggleRow(store: DocumentStore, n: TreeNode): void {
  if (n.ref) {
    const ref = n.ref;
    const refs = store.items().length ? [] : [...store.selection()];
    const at = refs.findIndex((r) => r.asset === ref.asset && r.id === ref.id);
    if (at >= 0) refs.splice(at, 1);
    else refs.push(ref);
    if (refs.length) store.select(refs);
    else store.clearSelection();
  } else if (n.item) {
    const item = n.item;
    const items = store.selection().length ? [] : store.items().filter((i) => i.kind === item.kind);
    const at = items.findIndex((i) => sameItem(i, item));
    if (at >= 0) items.splice(at, 1);
    else items.push(item);
    if (items.length) store.selectItems(items);
    else store.clearSelection();
  }
}
