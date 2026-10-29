import { CLIP_TEXTS } from '../clip/clip-texts';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DocumentStore } from '../document/document.store';
import { checkReorder } from '../document/model/reorder-rules';
import { TreeTarget } from '../document/model/selection';
import { ContextEntry, ContextMenu } from './context-menu';
import { EditService } from './edit.service';
import {
  ancestorsOfSelection,
  buildTree,
  flatten,
  indexTree,
  isExpanded,
  isSelected,
  targetOf,
  TreeNode,
  TreeRow,
} from './hierarchy-model';
import { HIERARCHY_TEXTS } from './hierarchy-texts';
import { treeNavigation } from './tree-navigation';
import { TreeDrag } from './tree-drag';
import { treeIcon } from './tree-icons';
import { selectable, selectSingle, selectRange, toggleRow } from './tree-selection';
import { Swatch } from './swatch';

/** From this many rows on only the visible ones are rendered (design 006 E1). */
export const VIRTUAL_FROM = 500;
/** Rows rendered above and below the visible part. */
const OVERSCAN = 10;
/** Fallback of `--tree-row-height`. */
const ROW_HEIGHT = 24;

/**
 * The hierarchy (prompt 006): the document as a tree after the WAI-ARIA APG tree pattern – flat
 * `treeitem`s with level/position, roving tab index, keys as actions of the `hierarchy` context
 * (`tree-navigation.ts`), selection synchronous with the canvas through the `DocumentStore`,
 * eye buttons, drag & drop (`TreeDrag`) and the context menu. Virtualised from 500 rows.
 */
@Component({
  selector: 'app-hierarchy-tree',
  imports: [ContextMenu],
  templateUrl: './hierarchy-tree.html',
  styleUrl: './hierarchy-tree.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HierarchyTree {
  readonly store = input.required<DocumentStore>();
  protected readonly t = HIERARCHY_TEXTS;
  protected readonly actions = inject(ActionService);
  private readonly edit = inject(EditService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly listEl = viewChild<ElementRef<HTMLElement>>('list');

  /** Rows whose open state differs from the default (`isExpanded`). */
  readonly toggled = signal<ReadonlySet<string>>(new Set());
  readonly focusedId = signal<string | null>(null);
  readonly anchor = signal<string | null>(null);
  protected readonly menu = signal<{ x: number; y: number } | null>(null);
  protected readonly scrollTop = signal(0);
  protected readonly viewHeight = signal(400);
  readonly rowHeight = signal(ROW_HEIGHT);

  private lastTree: { store: DocumentStore; tree: TreeNode } | null = null;
  /** The tree; while a gesture runs (drag, live field edit) the last one stays (prompt 031). */
  readonly tree = computed(() => {
    const store = this.store();
    const doc = store.document();
    const last = this.lastTree;
    if (store.gesture() && last?.store === store) return last.tree;
    const tree = buildTree(doc);
    this.lastTree = { store, tree };
    return tree;
  });
  readonly rows = computed(() => flatten(this.tree(), this.toggled()));
  protected readonly virtual = computed(() => this.rows().length >= VIRTUAL_FROM);
  /**
   * The rows to render and their indices. Virtualised: the visible part plus the row with tab
   * index 0 when it is scrolled away – Tab must always find a way into the tree (prompt 031).
   */
  protected readonly window = computed(() => {
    const rows = this.rows();
    if (!this.virtual()) return { rows, indices: rows.map((_, i) => i) };
    const h = this.rowHeight();
    const start = Math.max(0, Math.floor(this.scrollTop() / h) - OVERSCAN);
    const count = Math.ceil(this.viewHeight() / h) + 2 * OVERSCAN;
    const end = Math.min(rows.length, start + count);
    const indices = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
    const tab = this.tabRow();
    const t = tab === null ? -1 : rows.findIndex((r) => r.node.id === tab);
    if (t >= 0 && (t < start || t >= end)) {
      if (t < start) indices.unshift(t);
      else indices.push(t);
    }
    return { rows: indices.map((i) => rows[i]), indices };
  });
  protected readonly selectedIds = computed(() => {
    const s = this.store();
    const refs = s.selection();
    const items = s.items();
    return new Set(
      this.rows()
        .filter((r) => isSelected(r.node, refs, items))
        .map((r) => r.node.id),
    );
  });
  /** The row with tab index 0: the focused one, else the first selected, else the first. */
  protected readonly tabRow = computed(() => {
    const rows = this.rows();
    const f = this.focusedId();
    if (f && rows.some((r) => r.node.id === f)) return f;
    const sel = this.selectedIds();
    return rows.find((r) => sel.has(r.node.id))?.node.id ?? rows[0]?.node.id ?? null;
  });

  readonly drag = new TreeDrag(
    {
      rows: () => this.rows(),
      rowHeight: () => this.rowHeight(),
      list: () => this.listEl()?.nativeElement ?? null,
      sourcesFor: (row) => this.sourcesFor(row),
      allowed: (s, t, p) => checkReorder(this.store().document(), s, t, p) === null,
      drop: (s, t, p) => this.edit.reorder(s, t, p),
    },
    this.actions,
  );

  constructor() {
    const destroy = inject(DestroyRef);
    this.actions.registerAll(treeNavigation(this), destroy);
    // a selection made elsewhere (canvas, AI, paste): open its ancestors and scroll to it
    let seen: unknown[] = [];
    effect(() => {
      const s = this.store();
      const refs = s.selection();
      const items = s.items();
      if (refs === seen[0] && items === seen[1]) return;
      seen = [refs, items];
      untracked(() => this.reveal());
    });
    afterNextRender(() => {
      const v = getComputedStyle(this.host.nativeElement).getPropertyValue('--tree-row-height');
      const h = parseFloat(v);
      if (h > 0) this.rowHeight.set(h);
      const list = this.listEl()?.nativeElement;
      if (!list) return;
      const ro = new ResizeObserver(([e]) => this.viewHeight.set(e.contentRect.height || 400));
      ro.observe(list);
      destroy.onDestroy(() => ro.disconnect());
    });
  }

  protected icon = treeIcon;

  protected clipTitle(id: string): string {
    return CLIP_TEXTS.treeBadge(id);
  }

  protected swatchStyle(s: Swatch): string | null {
    return s.kind === 'color' || s.kind === 'gradient' ? s.css : null;
  }

  protected swatchText(s: Swatch): string {
    if (s.kind === 'color') return s.css;
    if (s.kind === 'gradient')
      return s.css.replace(/^linear-gradient\(90deg, /, '').replace(/\)$/, '');
    return s.kind === 'none'
      ? this.t.none
      : s.kind === 'pattern'
        ? this.t.pattern
        : this.t.inherited;
  }

  protected rowIndex(i: number): number {
    return this.window().indices[i];
  }

  /** Opens the ancestors of the selection and scrolls to it unless a selected row is in view. */
  reveal(): void {
    const s = this.store();
    const tree = this.tree();
    const index = indexTree(tree);
    const next = new Set(this.toggled());
    let changed = false;
    for (const id of ancestorsOfSelection(tree, s.selection(), s.items())) {
      const n = index.get(id)?.node;
      if (n && n.children.length && !isExpanded(n, next)) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        changed = true;
      }
    }
    if (changed) this.toggled.set(next);
    setTimeout(() => {
      const list = this.listEl()?.nativeElement;
      const sel = this.selectedIds();
      const idx = this.rows().flatMap((r, i) => (sel.has(r.node.id) ? [i] : []));
      if (!list || !idx.length) return;
      const h = this.rowHeight();
      const inView = idx.some(
        (i) => i * h >= list.scrollTop && (i + 1) * h <= list.scrollTop + list.clientHeight,
      );
      if (!inView) this.scrollToIndex(idx[0]);
    });
  }

  scrollToIndex(i: number, focus = false): void {
    const list = this.listEl()?.nativeElement;
    if (!list) return;
    const h = this.rowHeight();
    const top = i * h;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + h > list.scrollTop + list.clientHeight)
      list.scrollTop = top + h - list.clientHeight;
    this.scrollTop.set(list.scrollTop);
    const id = this.rows()[i]?.node.id;
    if (focus && id) {
      this.focusedId.set(id);
      clearTimeout(this.focusTimer);
      const el = this.rowElement(i);
      // a row outside the rendered window appears with the next render
      if (el) el.focus({ preventScroll: true });
      else this.focusTimer = setTimeout(() => this.rowElement(i)?.focus({ preventScroll: true }));
    }
  }

  private focusTimer: ReturnType<typeof setTimeout> | undefined;

  rowElement(i: number): HTMLElement | null {
    return this.listEl()?.nativeElement.querySelector<HTMLElement>(`[data-index="${i}"]`) ?? null;
  }

  focusedIndex(): number {
    const rows = this.rows();
    const id = this.tabRow();
    return rows.findIndex((r) => r.node.id === id);
  }

  toggleOpen(row: TreeRow): void {
    if (row.expanded === null) return;
    const next = new Set(this.toggled());
    if (next.has(row.node.id)) next.delete(row.node.id);
    else next.add(row.node.id);
    this.toggled.set(next);
  }

  /** What a drag of `row` moves (design 006 E7): the selection if the row is in it. */
  private sourcesFor(row: TreeRow): TreeTarget[] | null {
    if (!this.selectedIds().has(row.node.id)) selectSingle(this.store(), row.node);
    const s = this.store();
    const targets = this.rows()
      .filter((r) => isSelected(r.node, s.selection(), s.items()))
      .map((r) => targetOf(r.node));
    const list = targets.filter((t): t is TreeTarget => t !== null);
    return list.length ? list : null;
  }

  protected onScroll(e: Event): void {
    this.scrollTop.set((e.target as HTMLElement).scrollTop);
  }

  protected onRowClick(e: MouseEvent, row: TreeRow, index: number): void {
    if (this.drag.suppressClick) return;
    this.focusedId.set(row.node.id);
    const mod = this.actions.os === 'mac' ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && this.anchor() !== null) {
      const a = this.rows().findIndex((r) => r.node.id === this.anchor());
      selectRange(this.store(), this.rows(), a < 0 ? index : a, index);
      return;
    }
    if (mod) toggleRow(this.store(), row.node);
    else selectSingle(this.store(), row.node);
    if (selectable(row.node)) this.anchor.set(row.node.id);
  }

  protected onTwisty(e: MouseEvent, row: TreeRow): void {
    e.stopPropagation();
    this.toggleOpen(row);
  }

  protected onEye(e: MouseEvent, row: TreeRow): void {
    e.stopPropagation();
    const n = row.node;
    const sel = n.ref
      ? { nodes: [n.ref], items: [] }
      : { nodes: [], items: n.item ? [n.item] : [] };
    this.edit.toggleVisibility(sel, e.altKey);
  }

  protected onLock(e: MouseEvent, row: TreeRow): void {
    e.stopPropagation();
    if (row.node.ref) this.actions.run('edit.toggleLock', { nodes: [row.node.ref] });
  }

  protected onContextMenu(e: MouseEvent, row: TreeRow): void {
    e.preventDefault();
    if (!this.selectedIds().has(row.node.id)) selectSingle(this.store(), row.node);
    this.focusedId.set(row.node.id);
    clearTimeout(this.focusTimer);
    this.menu.set({ x: e.clientX, y: e.clientY });
  }

  /** Opens the context menu at the focused row (⇧F10 / context menu key). */
  openMenuAtFocus(): void {
    const i = this.focusedIndex();
    const el = i >= 0 ? this.rowElement(i) : null;
    const r = el?.getBoundingClientRect();
    clearTimeout(this.focusTimer);
    if (r) this.menu.set({ x: r.left + 24, y: r.bottom });
  }

  protected closeMenu(): void {
    this.menu.set(null);
    const i = this.focusedIndex();
    if (i >= 0) setTimeout(() => this.rowElement(i)?.focus());
  }

  protected chooseMenu(e: ContextEntry): void {
    this.closeMenu();
    this.actions.run(e.id, e.args);
  }
}
