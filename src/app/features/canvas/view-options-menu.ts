import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { isRadio } from '../menus/menu-model';
import { MENUS_TEXTS } from '../menus/menus-texts';

/** Labels are keys of the menu texts – resolved when the rows are built (language switch). */
type Key = keyof typeof MENUS_TEXTS;
type Row = { kind: 'item'; id: string; label?: Key } | { kind: 'group'; label: Key };

const T = MENUS_TEXTS;
const ROWS: Row[] = [
  { kind: 'item', id: 'view.rulers' },
  { kind: 'item', id: 'view.guides' },
  { kind: 'group', label: 'iconGrid' },
  { kind: 'item', id: 'view.guideTemplate.apple', label: 'gridApple' },
  { kind: 'item', id: 'view.guideTemplate.material', label: 'gridMaterial' },
  { kind: 'item', id: 'view.guideTemplate.grid', label: 'gridEven' },
  { kind: 'item', id: 'view.background' },
  { kind: 'item', id: 'view.effects' },
  { kind: 'item', id: 'view.crossCursor' },
  { kind: 'item', id: 'view.handles' },
  { kind: 'item', id: 'view.snapToGrid' },
  { kind: 'item', id: 'view.magicSnap' },
  { kind: 'item', id: 'view.smartGuides' },
  { kind: 'group', label: 'gridOrigin' },
  { kind: 'item', id: 'view.gridOrigin.worldZero', label: 'gridWorldZero' },
  { kind: 'item', id: 'view.gridOrigin.svgCenter', label: 'gridSvgCenter' },
  { kind: 'group', label: 'selectionMode' },
  { kind: 'item', id: 'view.selectionMode.point', label: 'selectionPoint' },
  { kind: 'item', id: 'view.selectionMode.boxed', label: 'selectionBoxed' },
  { kind: 'item', id: 'view.selectionMode.none', label: 'selectionNone' },
  { kind: 'group', label: 'appearance' },
  { kind: 'item', id: 'view.appearance.light', label: 'light' },
  { kind: 'item', id: 'view.appearance.dark', label: 'dark' },
  { kind: 'item', id: 'view.appearance.tinted', label: 'tinted' },
  { kind: 'group', label: 'mask' },
  { kind: 'item', id: 'view.mask.squircle', label: 'maskSquircle' },
  { kind: 'item', id: 'view.mask.circle', label: 'maskCircle' },
  { kind: 'item', id: 'view.mask.none', label: 'maskNone' },
];

/**
 * "View Options" of the canvas toolbar (design 005 E10, legacy): a menu button (WAI-ARIA APG) with
 * the same toggle and radio actions as the View menu. ↑/↓/Home/End move, Enter/Space toggle (the
 * menu stays open), Esc or Tab close it (Esc gives the focus back to the button).
 */
@Component({
  selector: 'app-view-options-menu',
  template: `
    <button
      #button
      type="button"
      class="btn quiet trigger"
      aria-haspopup="menu"
      aria-controls="view-options"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
      (keydown)="onButtonKey($event)"
    >
      {{ t.viewOptions }} ▾
    </button>
    @if (open()) {
      <!-- the keys of the menu are handled here for all items (they carry tabindex) -->
      <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
      <ul
        id="view-options"
        class="menu"
        role="menu"
        [attr.aria-label]="t.viewOptions"
        (keydown)="onMenuKey($event)"
      >
        @for (r of rows(); track $index) {
          @if (r.kind === 'group') {
            <li role="separator"></li>
            <li role="presentation" class="group">{{ r.label }}</li>
          } @else {
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
            <li
              tabindex="-1"
              [attr.role]="r.radio ? 'menuitemradio' : 'menuitemcheckbox'"
              [attr.aria-checked]="r.checked"
              [attr.aria-disabled]="r.enabled ? null : 'true'"
              [class.disabled]="!r.enabled"
              (click)="choose(r.id)"
            >
              <span class="check" aria-hidden="true">{{ r.checked ? '✓' : '' }}</span>
              <span>{{ r.label }}</span>
            </li>
          }
        }
      </ul>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }
    .trigger {
      height: 26px;
      padding: 0 var(--space-2);
      font-size: var(--font-size-small);
    }
    .menu {
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 20;
      min-width: 14rem;
      margin: 2px 0 0;
      padding: var(--space-1) 0;
      list-style: none;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-popup);
      font-size: var(--font-size-small);

      li[tabindex] {
        display: grid;
        grid-template-columns: 1.2rem 1fr;
        align-items: center;
        padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
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
      .group {
        padding: var(--space-1) var(--space-3);
        color: var(--color-text-muted);
      }
      [role='separator'] {
        height: 1px;
        margin: var(--space-1) 0;
        background: var(--color-border);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onDocumentPointer($event)' },
})
export class ViewOptionsMenu {
  private readonly actions = inject(ActionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = T;
  protected readonly open = signal(false);

  protected readonly rows = computed(() =>
    ROWS.map((r) =>
      r.kind === 'group'
        ? { kind: 'group' as const, label: T[r.label] as string }
        : {
            kind: 'item' as const,
            id: r.id,
            label: r.label ? (T[r.label] as string) : this.actions.label(r.id),
            enabled: this.actions.enabled(r.id),
            checked: this.actions.checked(r.id) ?? false,
            radio: isRadio(r.id),
          },
    ),
  );

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menu"] li[tabindex]')];
  }

  private button(): HTMLElement | null {
    return this.host.nativeElement.querySelector('.trigger');
  }

  private openAt(which: 'first' | 'last'): void {
    this.open.set(true);
    setTimeout(() => {
      const list = this.items();
      (which === 'first' ? list[0] : list[list.length - 1])?.focus();
    });
  }

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.openAt('first');
  }

  private close(focusButton: boolean): void {
    this.open.set(false);
    if (focusButton) this.button()?.focus();
  }

  protected onButtonKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.openAt(e.key === 'ArrowDown' ? 'first' : 'last');
    }
  }

  protected onMenuKey(e: KeyboardEvent): void {
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
        this.close(true);
        break;
      case 'Tab':
        this.open.set(false);
        return;
      case 'Enter':
      case ' ': {
        const row = this.rows().filter((r) => r.kind === 'item')[at];
        if (row?.kind === 'item') this.choose(row.id);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  protected choose(id: string): void {
    this.actions.run(id);
  }

  protected onDocumentPointer(e: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
