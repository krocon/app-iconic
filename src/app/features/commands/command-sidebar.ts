import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  effect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { matches } from '../menus/command-palette';
import { ADD_LAYOUT, AddGroupKey, AddSectionKey, entryIds } from './add-layout';
import { COMMAND_ICONS } from './command-icons';
import { COMMANDS_TEXTS } from './commands-texts';

interface Leaf {
  kind: 'action';
  id: string;
  label: string;
  shortcut: string;
  enabled: boolean;
  icon: string;
  /** Toggle tools (prompt 061): on/off; `undefined` for one-shot actions. */
  checked: boolean | undefined;
}

interface Group {
  kind: 'group';
  id: string;
  group: AddGroupKey;
  label: string;
  /** The icon of the active variant, else the last used one, else the first (prompt 061). */
  icon: string;
  /** One of its variants is the active tool (its label, for the screen reader). */
  checked: string | null;
  items: Leaf[];
}

/** A row of the list; `index` among the rows (for `aria-activedescendant`). */
type Row = (Leaf | Group) & { index: number };

/** Hover delay before a submenu opens or closes (lets the pointer cross other rows). */
const HOVER_MS = 120;

/**
 * The command sidebar (design 008 E10): every "Add" action with icon, title and shortcut, a
 * filter field, keyboard (↑/↓/Home/End move, Enter runs – APG combobox with a listbox: the field
 * keeps the focus). The variants of one shape sit in a submenu beside the list like in Fusion's
 * "Create" menu (prompt 019): hover or click opens it, → / Enter from the keyboard, ← / Esc close
 * it. With a filter the list is flat. A click runs the action and gives the focus to the canvas;
 * Enter keeps it here for the next one.
 */
@Component({
  selector: 'app-command-sidebar',
  templateUrl: './command-sidebar.html',
  styleUrl: './command-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerleave)': 'leave()',
    '(document:pointerdown)': 'onDocumentPointer($event)',
    '(window:resize)': 'close()',
  },
})
export class CommandSidebar {
  protected readonly actions = inject(ActionService);
  protected readonly t = COMMANDS_TEXTS;
  /** Folded panel: the icons only (a tool bar), no filter. */
  readonly compact = input(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  /** The open submenu. */
  protected readonly open = signal<AddGroupKey | null>(null);
  /** The keyboard row in the submenu; -1 while the keyboard stays in the list (opened by hover). */
  protected readonly sub = signal(-1);
  /** Where the submenu is (viewport pixels). */
  protected readonly at = signal({ left: 0, top: 0 });
  /** The last active variant of each shape (its icon stands for the group, prompt 061). */
  private readonly lastUsed = signal<Partial<Record<AddGroupKey, string>>>({});
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private leaf(id: string): Leaf {
    return {
      kind: 'action',
      id,
      label: this.actions.label(id),
      shortcut: this.actions.shortcut(id),
      enabled: this.actions.enabled(id),
      icon: COMMAND_ICONS[id] ?? '',
      checked: this.actions.checked(id),
    };
  }

  protected readonly sections = computed(() => {
    const q = this.query();
    let index = 0;
    const row = (r: Leaf | Group): Row => ({ ...r, index: index++ });
    return ADD_LAYOUT.map((s): { section: AddSectionKey; rows: Row[] } => ({
      section: s.section,
      rows: q
        ? // with a filter: the matching variants, flat
          s.entries
            .flatMap(entryIds)
            .map((id) => ({ id, label: this.actions.label(id) }))
            .filter((e) => matches(e, q))
            .map((e) => row(this.leaf(e.id)))
        : s.entries.map((e) => {
            if (e.kind === 'action') return row(this.leaf(e.id));
            const items = e.ids.map((id) => this.leaf(id));
            const on = items.find((i) => i.checked === true);
            const last = items.find((i) => i.id === this.lastUsed()[e.group]);
            return row({
              kind: 'group',
              id: `group:${e.group}`,
              group: e.group,
              label: this.t.groups[e.group],
              icon: (on ?? last ?? items[0])?.icon ?? '',
              checked: on?.label ?? null,
              items,
            });
          }),
    })).filter((s) => s.rows.length > 0);
  });

  protected readonly rows = computed(() => this.sections().flatMap((s) => s.rows));

  protected readonly flyout = computed(() => {
    const key = this.open();
    const r = this.rows().find((x) => x.kind === 'group' && x.group === key);
    return r?.kind === 'group' ? r : null;
  });

  protected readonly activeId = computed(() => {
    if (this.flyout() && this.sub() >= 0) return `command-sub-${this.sub()}`;
    return this.rows().length ? `command-${this.active()}` : null;
  });

  constructor() {
    // remember the variant that was on: it stays the group's icon (prompt 061)
    effect(() => {
      for (const s of ADD_LAYOUT)
        for (const e of s.entries) {
          if (e.kind !== 'group') continue;
          const on = e.ids.find((id) => this.actions.checked(id) === true);
          if (on && untracked(this.lastUsed)[e.group] !== on)
            this.lastUsed.update((m) => ({ ...m, [e.group]: on }));
        }
    });
    afterRenderEffect(() => {
      this.host.querySelector(`#command-${this.active()}`)?.scrollIntoView?.({ block: 'nearest' });
    });
    // keep the submenu inside the window (its size is known after render)
    afterRenderEffect(() => {
      const pos = this.at();
      const el = this.host.querySelector<HTMLElement>('.flyout');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = Math.max(4, Math.min(pos.top, innerHeight - r.height - 4));
      const left =
        pos.left + r.width > innerWidth ? Math.max(4, innerWidth - r.width - 4) : pos.left;
      if (top !== pos.top || left !== pos.left) this.at.set({ left, top });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** For the screen reader: the shape and its active tool ("Line, submenu, active: Pen"). */
  protected groupLabel(r: Group): string {
    const base = `${r.label}, ${this.t.submenu}`;
    return r.checked ? `${base}, ${this.t.active}: ${r.checked}` : base;
  }

  protected tooltip(r: Leaf | Group): string {
    if (r.kind === 'group') return r.checked ? `${r.label} – ${r.checked}` : r.label;
    return r.enabled ? this.actions.tooltip(r.id) : `${r.label} – ${this.t.later}`;
  }

  /** Opens the submenu of a group row beside the list. */
  private openGroup(r: Row, keyboard: boolean): void {
    if (r.kind !== 'group') return;
    this.cancelHover();
    const row = this.host.querySelector(`#command-${r.index}`);
    const box = row?.getBoundingClientRect();
    const right = this.host.getBoundingClientRect().right;
    // overlaps the sidebar a little so the pointer never leaves the host on its way
    this.at.set({ left: right - 4, top: (box?.top ?? 0) - 4 });
    this.active.set(r.index);
    this.open.set(r.group);
    this.sub.set(keyboard ? 0 : -1);
  }

  protected close(): void {
    this.cancelHover();
    this.open.set(null);
    this.sub.set(-1);
  }

  protected cancelHover(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  protected hover(r: Row): void {
    this.cancelHover();
    if (r.kind === 'group' && r.group === this.open()) return;
    if (r.kind === 'action' && !this.open()) return;
    this.timer = setTimeout(
      () => (r.kind === 'group' ? this.openGroup(r, false) : this.close()),
      HOVER_MS,
    );
  }

  /** The pointer left the sidebar and the submenu: close one the mouse opened. */
  protected leave(): void {
    if (this.sub() < 0) this.close();
  }

  protected onDocumentPointer(e: PointerEvent): void {
    if (this.open() && !this.host.contains(e.target as Node)) this.close();
  }

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.active.set(0);
    this.close();
  }

  protected onKey(e: KeyboardEvent): void {
    const handled = this.flyout() && this.sub() >= 0 ? this.subKey(e.key) : this.listKey(e.key);
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Keys on a tool of the folded bar: → / Enter / Space open a shape's submenu, then as in the list. */
  protected railKey(r: Row, e: KeyboardEvent): void {
    let handled = false;
    if (this.flyout() && this.sub() >= 0) handled = this.subKey(e.key);
    else if (r.kind === 'group' && ['ArrowRight', 'Enter', ' '].includes(e.key)) {
      this.openGroup(r, true);
      handled = true;
    }
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Keys while the keyboard is in the submenu. */
  private subKey(key: string): boolean {
    const items = this.flyout()!.items;
    const n = items.length;
    switch (key) {
      case 'ArrowDown':
        this.sub.update((i) => (i + 1) % n);
        return true;
      case 'ArrowUp':
        this.sub.update((i) => (i - 1 + n) % n);
        return true;
      case 'Home':
        this.sub.set(0);
        return true;
      case 'End':
        this.sub.set(n - 1);
        return true;
      case 'Enter': {
        const r = items[this.sub()];
        if (r?.enabled) {
          this.close();
          this.actions.run(r.id);
        }
        return true;
      }
      case 'ArrowLeft':
      case 'Escape':
        this.close();
        return true;
      case 'ArrowRight':
        return true;
      default:
        return false;
    }
  }

  /** Keys while the keyboard is in the list. */
  private listKey(key: string): boolean {
    const rows = this.rows();
    const n = rows.length;
    const row = rows[this.active()];
    switch (key) {
      case 'ArrowDown':
        if (!n) return true;
        this.close();
        this.active.update((i) => (i + 1) % n);
        return true;
      case 'ArrowUp':
        if (!n) return true;
        this.close();
        this.active.update((i) => (i - 1 + n) % n);
        return true;
      case 'Home':
        if (!n || this.query()) return false; // with a filter the field keeps Home/End (APG)
        this.close();
        this.active.set(0);
        return true;
      case 'End':
        if (!n || this.query()) return false;
        this.close();
        this.active.set(n - 1);
        return true;
      case 'ArrowRight':
        if (row?.kind !== 'group') return false; // the caret moves in the field
        this.openGroup(row, true);
        return true;
      case 'Enter':
        if (row?.kind === 'group') this.openGroup(row, true);
        else if (row) this.actions.run(row.id);
        return true;
      case 'Escape':
        if (this.open()) this.close();
        else if (this.query()) {
          this.query.set('');
          this.active.set(0);
        } else return false;
        return true;
      default:
        return false;
    }
  }

  protected click(r: Leaf | Row): void {
    if ('index' in r) this.active.set(r.index);
    if (r.kind === 'group') {
      if (this.open() === r.group) this.close();
      else this.openGroup(r as Row, false);
      return;
    }
    if (!r.enabled) return;
    this.close();
    this.actions.run(r.id);
    this.host.ownerDocument.querySelector<HTMLElement>('app-canvas-view .viewport')?.focus();
  }
}
