import { NodeRef } from '../icon-document';

/**
 * What can be selected besides SVG nodes (design 006 E5): the icon itself (background fill), a
 * group or a layer of `icon.json`. Plain JSON (the AI selects with it, `edit.select`).
 */
export type IconItem =
  | { kind: 'root' }
  | { kind: 'group'; group: number }
  | { kind: 'layer'; group: number; layer: number };

/** A thing in the tree that can be moved (design 006 E6, `ReorderNode`). Plain JSON. */
export type TreeTarget =
  | { kind: 'group'; group: number }
  | { kind: 'layer'; group: number; layer: number }
  | { kind: 'node'; ref: NodeRef };

export type DropPosition = 'before' | 'after' | 'into';

export const DROP_POSITIONS: readonly DropPosition[] = ['before', 'after', 'into'];

export function sameRef(a: NodeRef, b: NodeRef): boolean {
  return a.asset === b.asset && a.id === b.id;
}

export function sameItem(a: IconItem, b: IconItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'root') return true;
  if (a.kind === 'group') return a.group === (b as typeof a).group;
  const o = b as typeof a;
  return a.group === o.group && a.layer === o.layer;
}

export function sameTarget(a: TreeTarget, b: TreeTarget): boolean {
  if (a.kind === 'node' || b.kind === 'node') {
    return a.kind === 'node' && b.kind === 'node' && sameRef(a.ref, b.ref);
  }
  return sameItem(a, b);
}
