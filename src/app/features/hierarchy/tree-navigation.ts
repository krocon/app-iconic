import { ActionHandler } from '../../core/actions/action.service';
import { DocumentStore } from '../document/document.store';
import { TreeRow } from './hierarchy-model';
import { selectable, selectRange, selectSingle, toggleRow } from './tree-selection';

/** What the key actions need from the tree component. */
export interface NavigableTree {
  store(): DocumentStore;
  rows(): readonly TreeRow[];
  anchor: { (): string | null; set(v: string | null): void };
  focusedIndex(): number;
  scrollToIndex(i: number, focus?: boolean): void;
  toggleOpen(row: TreeRow): void;
  openMenuAtFocus(): void;
  /** Inline rename of the focused row (prompt 072 E1). */
  startRename(row: TreeRow): void;
  canRename(row: TreeRow | undefined): boolean;
  /** Focus the filter field (prompt 072 E2). */
  focusFilter(): void;
  /** Open or close every row (prompt 072 E3). */
  setAllOpen(open: boolean): void;
}

/**
 * The keys of the tree as actions of the `hierarchy` context (design 006 E5, WAI-ARIA APG tree
 * pattern; CLAUDE.md §4 "Tastatur nur über Aktionen"): ↑/↓/Home/End move focus and selection,
 * →/← open/close or go to the child/parent, ⇧ extends the range from the anchor, Mod+↑/↓ move the
 * focus only, Space/Enter select, Mod+Space (macOS Ctrl+Space) toggles, ⇧F10 opens the menu;
 * F2 (macOS Enter) renames, Mod+F filters, Expand / Collapse All (prompt 072).
 */
export function treeNavigation(tree: NavigableTree): Record<string, ActionHandler> {
  const has = () => tree.rows().length > 0;
  const go = (to: (at: number, n: number) => number, mode: 'select' | 'extend' | 'focus') => ({
    enabled: has,
    run: () => {
      const rows = tree.rows();
      const at = tree.focusedIndex();
      const i = Math.max(0, Math.min(rows.length - 1, to(at, rows.length)));
      tree.scrollToIndex(i, true);
      const row = rows[i];
      if (mode === 'select') {
        selectSingle(tree.store(), row.node);
        if (selectable(row.node)) tree.anchor.set(row.node.id);
      } else if (mode === 'extend') {
        const a = rows.findIndex((r) => r.node.id === tree.anchor());
        selectRange(tree.store(), rows, a < 0 ? at : a, i);
        if (a < 0) tree.anchor.set(rows[at]?.node.id ?? null);
      }
    },
  });
  const current = () => tree.rows()[tree.focusedIndex()];
  return {
    'hierarchy.next': go((at) => at + 1, 'select'),
    'hierarchy.prev': go((at) => at - 1, 'select'),
    'hierarchy.first': go(() => 0, 'select'),
    'hierarchy.last': go((_, n) => n - 1, 'select'),
    'hierarchy.extendNext': go((at) => at + 1, 'extend'),
    'hierarchy.extendPrev': go((at) => at - 1, 'extend'),
    'hierarchy.extendFirst': go(() => 0, 'extend'),
    'hierarchy.extendLast': go((_, n) => n - 1, 'extend'),
    'hierarchy.focusNext': go((at) => at + 1, 'focus'),
    'hierarchy.focusPrev': go((at) => at - 1, 'focus'),
    'hierarchy.expand': {
      enabled: has,
      run: () => {
        const row = current();
        if (!row || row.expanded === null) return;
        if (!row.expanded) tree.toggleOpen(row);
        else go((at) => at + 1, 'select').run();
      },
    },
    'hierarchy.collapse': {
      enabled: has,
      run: () => {
        const row = current();
        if (!row) return;
        if (row.expanded) {
          tree.toggleOpen(row);
          return;
        }
        const parent = tree.rows().findIndex((r) => r.node.id === row.parent);
        if (parent >= 0) go(() => parent, 'select').run();
      },
    },
    'hierarchy.select': {
      enabled: has,
      run: () => {
        const row = current();
        if (!row) return;
        selectSingle(tree.store(), row.node);
        if (selectable(row.node)) tree.anchor.set(row.node.id);
      },
    },
    'hierarchy.toggleSelect': {
      enabled: has,
      run: () => {
        const row = current();
        if (row) toggleRow(tree.store(), row.node);
      },
    },
    'hierarchy.menu': { enabled: has, run: () => tree.openMenuAtFocus() },
    'hierarchy.rename': {
      enabled: () => tree.canRename(current()),
      run: () => {
        const row = current();
        if (row && tree.canRename(row)) tree.startRename(row);
      },
    },
    'hierarchy.find': { run: () => tree.focusFilter() },
    'hierarchy.expandAll': { enabled: has, run: () => tree.setAllOpen(true) },
    'hierarchy.collapseAll': { enabled: has, run: () => tree.setAllOpen(false) },
  };
}
