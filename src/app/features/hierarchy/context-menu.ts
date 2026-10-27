import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';

/** One entry: an action with optional arguments and an own label. */
export interface ContextEntry {
  id: string;
  args?: unknown;
  label?: string;
  separatorBefore?: boolean;
}

/** The entries of the tree's context menu (design 006 E8, legacy §7.2). */
export const TREE_MENU: readonly ContextEntry[] = [
  { id: 'edit.duplicate' },
  { id: 'arrange.group' },
  { id: 'arrange.bringToFront', separatorBefore: true },
  { id: 'arrange.sendToBack' },
  { id: 'edit.editSvg', separatorBefore: true },
  { id: 'path.optimize' },
  { id: 'edit.copyXml' },
  { id: 'edit.delete', args: { confirm: true }, label: T.deleteMenu, separatorBefore: true },
];

/**
 * A context menu (WAI-ARIA APG "menu"): opens at a point with the focus on the first item;
 * ↑/↓/Home/End move, Enter/Space choose, Esc/Tab or a click outside close. The keys are handled
 * here (the dispatcher leaves `role="menu"` alone, design 005 E4). Emits the chosen entry; the
 * caller gives the focus back and runs the action.
 */
@Component({
  selector: 'app-context-menu',
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
    <ul
      class="menu"
      role="menu"
      [attr.aria-label]="label()"
      [style.left.px]="x()"
      [style.top.px]="y()"
      (keydown)="onKey($event)"
    >
      @for (e of resolved(); track e.id) {
        @if (e.separatorBefore) {
          <li role="separator"></li>
        }
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <li
          role="menuitem"
          tabindex="-1"
          [attr.aria-disabled]="e.enabled ? null : 'true'"
          [class.disabled]="!e.enabled"
          (click)="choose(e)"
        >
          <span class="label">{{ e.text }}</span>
          <span class="key">{{ e.key }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 30;
      min-width: 13rem;
      margin: 0;
      padding: var(--space-1) 0;
      list-style: none;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-popup);
      font-size: var(--font-size-small);
    }
    [role='menuitem'] {
      display: flex;
      gap: var(--space-4);
      justify-content: space-between;
      padding: var(--space-1) var(--space-3);
      cursor: default;

      &:hover,
      &:focus {
        background: var(--color-hover);
        outline: none;
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
      &.disabled {
        color: var(--color-text-muted);
      }
    }
    .key {
      color: var(--color-text-muted);
    }
    [role='separator'] {
      height: 1px;
      margin: var(--space-1) 0;
      background: var(--color-border);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onDocumentPointer($event)' },
})
export class ContextMenu {
  private readonly actions = inject(ActionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly entries = input<readonly ContextEntry[]>(TREE_MENU);
  readonly at = input.required<{ x: number; y: number }>();
  readonly label = input<string>(T.contextMenu);
  readonly chosen = output<ContextEntry>();
  readonly closed = output<void>();

  protected readonly resolved = computed(() =>
    this.entries().map((e) => ({
      ...e,
      text: e.label ?? this.actions.label(e.id),
      enabled: this.actions.enabled(e.id),
      key: this.actions.shortcut(e.id),
    })),
  );

  /** Kept inside the window (an estimate before the size is known; corrected after render). */
  protected readonly x = computed(() => Math.max(0, Math.min(this.at().x, innerWidth - 220)));
  protected readonly y = computed(() => Math.max(0, Math.min(this.at().y, innerHeight - 240)));

  constructor() {
    afterNextRender(() => this.items()[0]?.focus());
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  protected onKey(e: KeyboardEvent): void {
    const list = this.items();
    const at = list.indexOf(e.target as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        list[(at + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        list[(at - 1 + list.length) % list.length]?.focus();
        break;
      case 'Home':
        list[0]?.focus();
        break;
      case 'End':
        list[list.length - 1]?.focus();
        break;
      case 'Escape':
      case 'Tab':
        this.closed.emit();
        break;
      case 'Enter':
      case ' ': {
        const entry = this.resolved()[at];
        if (entry) this.choose(entry);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  protected choose(e: ContextEntry & { enabled: boolean }): void {
    if (e.enabled) this.chosen.emit(e);
  }

  protected onDocumentPointer(e: PointerEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.closed.emit();
  }
}
