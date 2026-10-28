import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { matches } from '../menus/command-palette';
import { COMMAND_ICONS } from './command-icons';
import { COMMANDS_TEXTS } from './commands-texts';

type Section = keyof typeof COMMANDS_TEXTS.sections;

/**
 * The add actions in the order of the Add menu, by section (design 008 E10): grouped by shape
 * like Fusion's "Create" menu – line, rectangle, circle, arc, then the other shapes; in each group
 * the one-click variant at the centre first, then the sketch tools (`menu-model.spec` checks the
 * Add menu has the same order).
 */
export const SIDEBAR_COMMANDS: readonly { section: Section; ids: readonly string[] }[] = [
  { section: 'structure', ids: ['add.iconGroup', 'add.container'] },
  {
    section: 'line',
    ids: ['add.line', 'sketch.line', 'sketch.midpointLine', 'add.polyline'],
  },
  {
    section: 'rectangle',
    ids: ['add.rect', 'sketch.rect2p', 'sketch.rect3p', 'sketch.rectCenter'],
  },
  {
    section: 'circle',
    ids: [
      'add.circle',
      'sketch.circleCenter',
      'sketch.circle2p',
      'sketch.circle3p',
      'sketch.circle2t',
      'sketch.circle3t',
    ],
  },
  { section: 'arc', ids: ['sketch.arc3p', 'sketch.arcCenter', 'sketch.arcTangent'] },
  { section: 'shapes', ids: ['add.polygon', 'add.ellipse', 'add.path', 'add.freehand'] },
  { section: 'text', ids: ['add.text', 'add.textToPath'] },
  { section: 'import', ids: ['add.symbol', 'add.svgSnippet', 'add.image'] },
];

interface Row {
  id: string;
  label: string;
  shortcut: string;
  enabled: boolean;
  icon: string;
  /** Index among the options (for `aria-activedescendant`). */
  index: number;
}

/**
 * The command sidebar (design 008 E10): every "Add" action with icon, title and shortcut, a
 * filter field, keyboard (↑/↓/Home/End move, Enter runs – APG combobox with a listbox: the field
 * keeps the focus). Entries of later prompts stay visible, disabled. A click runs the action and
 * gives the focus to the canvas; Enter keeps it here for the next one.
 */
@Component({
  selector: 'app-command-sidebar',
  template: `
    <input
      class="input query"
      type="search"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="true"
      aria-controls="command-list"
      spellcheck="false"
      autocomplete="off"
      data-testid="command-filter"
      [attr.aria-label]="t.search"
      [attr.aria-activedescendant]="rows().length ? 'command-' + active() : null"
      [placeholder]="t.searchPlaceholder"
      [value]="query()"
      (input)="onInput($event)"
      (keydown)="onKey($event)"
    />
    <ul id="command-list" class="list" role="listbox" [attr.aria-label]="t.listLabel">
      @for (s of sections(); track s.section) {
        <li class="section" role="presentation">{{ t.sections[s.section] }}</li>
        @for (r of s.rows; track r.id) {
          <!-- options of a combobox: the field keeps the focus (aria-activedescendant) -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <li
            role="option"
            [id]="'command-' + r.index"
            [attr.data-action]="r.id"
            [attr.aria-selected]="r.index === active()"
            [attr.aria-disabled]="!r.enabled"
            [class.active]="r.index === active()"
            [class.disabled]="!r.enabled"
            [title]="r.enabled ? actions.tooltip(r.id) : r.label + ' – ' + t.later"
            (pointerdown)="$event.preventDefault()"
            (click)="click(r)"
          >
            <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
              <path [attr.d]="r.icon" />
            </svg>
            <span class="label">{{ r.label }}</span>
            @if (r.shortcut) {
              <kbd>{{ r.shortcut }}</kbd>
            }
          </li>
        }
      } @empty {
        <li class="empty" role="presentation">{{ t.noMatch }}</li>
      }
    </ul>
  `,
  styleUrl: './command-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandSidebar {
  protected readonly actions = inject(ActionService);
  protected readonly t = COMMANDS_TEXTS;
  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly sections = computed(() => {
    let index = 0;
    return SIDEBAR_COMMANDS.map((s) => ({
      section: s.section,
      rows: s.ids
        .map((id) => ({ id, label: this.actions.label(id) }))
        .filter((e) => matches(e, this.query()))
        .map((e): Row => ({
          ...e,
          shortcut: this.actions.shortcut(e.id),
          enabled: this.actions.enabled(e.id),
          icon: COMMAND_ICONS[e.id] ?? '',
          index: index++,
        })),
    })).filter((s) => s.rows.length > 0);
  });

  protected readonly rows = computed(() => this.sections().flatMap((s) => s.rows));

  constructor() {
    afterRenderEffect(() => {
      this.host.querySelector(`#command-${this.active()}`)?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.rows().length;
    switch (e.key) {
      case 'ArrowDown':
        if (n) this.active.update((i) => (i + 1) % n);
        break;
      case 'ArrowUp':
        if (n) this.active.update((i) => (i - 1 + n) % n);
        break;
      case 'Home':
        if (!n || this.query()) return; // with a filter the field keeps Home/End (APG)
        this.active.set(0);
        break;
      case 'End':
        if (!n || this.query()) return;
        this.active.set(n - 1);
        break;
      case 'Enter': {
        const r = this.rows()[this.active()];
        if (r) this.actions.run(r.id);
        break;
      }
      case 'Escape':
        if (!this.query()) return;
        this.query.set('');
        this.active.set(0);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  protected click(r: Row): void {
    this.active.set(r.index);
    if (!r.enabled) return;
    this.actions.run(r.id);
    this.host.ownerDocument.querySelector<HTMLElement>('app-canvas-view .viewport')?.focus();
  }
}
