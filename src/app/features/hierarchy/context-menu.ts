import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ContextEntry } from '../menus/context-menu-model';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';

export type { ContextEntry } from '../menus/context-menu-model';

interface Resolved extends ContextEntry {
  text: string;
  enabled: boolean;
  key: string;
  sub: Resolved[] | null;
}

/**
 * A context menu (WAI-ARIA APG "menu"): opens at a point with the focus on the first item;
 * ↑/↓/Home/End move, Enter/Space choose, Esc/Tab or a click outside close. One level of submenus
 * (prompt 070: Arrange ▸, Pathfinder ▸): → / Enter / hover open it beside its item, ← / Esc go
 * back. The keys are handled here (the dispatcher leaves `role="menu"` alone, design 005 E4).
 * Emits the chosen entry; the caller gives the focus back and runs the action. Disabled entries
 * are shown greyed out (`aria-disabled`).
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
      @for (e of resolved(); track e.id; let i = $index) {
        @if (e.separatorBefore) {
          <li role="separator"></li>
        }
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <li
          role="menuitem"
          tabindex="-1"
          [attr.data-action]="e.sub ? null : e.id"
          [attr.data-submenu]="e.sub ? e.id : null"
          [attr.aria-haspopup]="e.sub ? 'menu' : null"
          [attr.aria-expanded]="e.sub ? openSub() === i : null"
          [attr.aria-disabled]="e.enabled ? null : 'true'"
          [class.disabled]="!e.enabled"
          (click)="choose(e, i)"
          (pointerenter)="hover(e, i)"
        >
          <span class="label">{{ e.text }}</span>
          <span class="key">{{ e.sub ? '▸' : e.key }}</span>
          @if (e.sub && openSub() === i) {
            <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
            <ul
              class="menu sub"
              role="menu"
              [attr.aria-label]="e.text"
              (keydown)="onSubKey($event)"
            >
              @for (s of e.sub; track s.id) {
                @if (s.separatorBefore) {
                  <li role="separator"></li>
                }
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
                <li
                  role="menuitem"
                  tabindex="-1"
                  [attr.data-action]="s.id"
                  [attr.aria-disabled]="s.enabled ? null : 'true'"
                  [class.disabled]="!s.enabled"
                  (click)="$event.stopPropagation(); choose(s, -1)"
                >
                  <span class="label">{{ s.text }}</span>
                  <span class="key">{{ s.key }}</span>
                </li>
              }
            </ul>
          }
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
    .sub {
      position: absolute;
      left: calc(100% - 4px);
      top: calc(-1 * var(--space-1));
    }
    [role='menuitem'] {
      position: relative;
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
  private readonly injector = inject(Injector);
  readonly entries = input.required<readonly ContextEntry[]>();
  readonly at = input.required<{ x: number; y: number }>();
  readonly label = input<string>(T.contextMenu);
  readonly chosen = output<ContextEntry>();
  readonly closed = output<void>();
  /** The index of the open submenu. */
  protected readonly openSub = signal<number | null>(null);

  private resolve(e: ContextEntry): Resolved {
    const sub = e.items ? e.items.map((x) => this.resolve(x)) : null;
    return {
      ...e,
      text: e.label ?? this.actions.label(e.id),
      enabled: sub ? sub.some((s) => s.enabled) : this.actions.enabled(e.id),
      key: sub ? '' : this.actions.shortcut(e.id),
      sub,
    };
  }

  protected readonly resolved = computed(() => this.entries().map((e) => this.resolve(e)));

  /** Kept inside the window (an estimate before the size is known; corrected after render). */
  protected readonly x = computed(() => Math.max(0, Math.min(this.at().x, innerWidth - 220)));
  protected readonly y = computed(() => Math.max(0, Math.min(this.at().y, innerHeight - 320)));

  constructor() {
    afterNextRender(() => this.items()[0]?.focus());
  }

  /** The items of the top menu (not of the submenu). */
  private items(): HTMLElement[] {
    const top = this.host.nativeElement.querySelector(':scope > ul');
    return [...(top?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]') ?? [])];
  }

  private subItems(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('.sub [role="menuitem"]')];
  }

  private openSubmenu(i: number, focus: boolean): void {
    this.openSub.set(i);
    if (focus) afterNextRender(() => this.subItems()[0]?.focus(), { injector: this.injector });
  }

  protected hover(e: Resolved, i: number): void {
    if (e.sub && e.enabled) this.openSubmenu(i, false);
    else if (this.openSub() !== null) this.openSub.set(null);
  }

  protected onKey(e: KeyboardEvent): void {
    const list = this.items();
    const at = list.indexOf(e.target as HTMLElement);
    if (at < 0) return; // a key of the submenu bubbles up – handled there
    const entry = this.resolved()[at];
    switch (e.key) {
      case 'ArrowDown':
        this.openSub.set(null);
        list[(at + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        this.openSub.set(null);
        list[(at - 1 + list.length) % list.length]?.focus();
        break;
      case 'Home':
        list[0]?.focus();
        break;
      case 'End':
        list[list.length - 1]?.focus();
        break;
      case 'ArrowRight':
        if (entry?.sub && entry.enabled) this.openSubmenu(at, true);
        break;
      case 'Escape':
      case 'Tab':
        this.closed.emit();
        break;
      case 'Enter':
      case ' ':
        if (entry) this.choose(entry, at);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  protected onSubKey(e: KeyboardEvent): void {
    const list = this.subItems();
    const at = list.indexOf(e.target as HTMLElement);
    const i = this.openSub();
    const sub = i !== null ? this.resolved()[i]?.sub : null;
    switch (e.key) {
      case 'ArrowDown':
        list[(at + 1) % list.length]?.focus();
        break;
      case 'ArrowUp':
        list[(at - 1 + list.length) % list.length]?.focus();
        break;
      case 'ArrowLeft':
      case 'Escape':
        this.openSub.set(null);
        if (i !== null) this.items()[i]?.focus();
        break;
      case 'Tab':
        this.closed.emit();
        break;
      case 'Enter':
      case ' ':
        if (sub?.[at]) this.choose(sub[at], -1);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  protected choose(e: Resolved, i: number): void {
    if (!e.enabled) return;
    if (e.sub) {
      this.openSubmenu(i, true);
      return;
    }
    this.chosen.emit(e);
  }

  protected onDocumentPointer(e: PointerEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.closed.emit();
  }
}
