import { signal } from '@angular/core';
import { TreeNode, TreeRow } from './hierarchy-model';
import { RenameService } from './rename.service';

/** Rows that can be renamed: groups, layers and SVG elements (not root, "Definitions"). */
export function canRename(n: TreeNode | undefined): boolean {
  return !!n && (n.kind === 'group' || n.kind === 'layer' || (n.kind === 'node' && !!n.ref));
}

/** The text a rename field starts with: the name of a group/layer, an element's `id`. */
export function renameStart(n: TreeNode, elementId: (n: TreeNode) => string): string {
  return n.kind === 'node' ? elementId(n) : n.label;
}

/**
 * The inline rename of the tree (prompt 072 E1): one row at a time; Enter or leaving the field
 * commits (one undo step), Esc cancels. Then the focus goes back to the row.
 */
export class TreeRename {
  /** Row id being renamed. */
  readonly editing = signal<string | null>(null);

  constructor(
    private readonly rename: RenameService,
    private readonly refocus: () => void,
  ) {}

  start(row: TreeRow): void {
    if (canRename(row.node)) this.editing.set(row.node.id);
  }

  commit(n: TreeNode, value: string): void {
    if (this.editing() !== n.id) return;
    this.editing.set(null);
    if (n.ref) this.rename.renameElement(n.ref, value);
    else if (n.item) this.rename.renameItem(n.item, value);
    this.refocus();
  }

  cancel(): void {
    if (this.editing() === null) return;
    this.editing.set(null);
    this.refocus();
  }

  onKey(e: KeyboardEvent, n: TreeNode): void {
    if (e.key === 'Enter') this.commit(n, (e.target as HTMLInputElement).value);
    else if (e.key === 'Escape') this.cancel();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
}
