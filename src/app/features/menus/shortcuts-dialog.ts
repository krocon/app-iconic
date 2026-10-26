import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionGroup, ACTIONS } from '../../core/actions/action-catalog';
import { ActionService } from '../../core/actions/action.service';
import { formatChord } from '../../core/actions/shortcut';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { matches } from './command-palette';
import { MENUS_TEXTS } from './menus-texts';

const GROUP_ORDER: ActionGroup[] = ['file', 'edit', 'view', 'add', 'arrange', 'app', 'help'];

/**
 * All shortcuts at a glance (design 005 E9, ⌘/; taken over from editlicious
 * `shortcuts-dialog.ts`): every action with its chords of this OS, grouped by menu, filterable.
 * Overrides from `keymap.json` are included.
 */
@Component({
  selector: 'app-shortcuts-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.shortcutsTitle" width="40rem" height="80vh" (closed)="dialogs.close()">
      <input
        class="input"
        type="search"
        data-autofocus
        spellcheck="false"
        [attr.aria-label]="t.shortcutsFilter"
        [placeholder]="t.shortcutsFilter"
        (input)="query.set($any($event.target).value)"
      />
      <div class="list" tabindex="0" role="region" [attr.aria-label]="t.shortcutsTitle">
        <table>
          <tbody>
            @for (r of rows(); track r.id) {
              @if (r.first) {
                <tr class="head">
                  <th colspan="2" scope="colgroup">{{ t.groups[r.group] }}</th>
                </tr>
              }
              <tr>
                <td>{{ r.label }}</td>
                <td class="keys">
                  @for (k of r.keys; track k) {
                    <kbd>{{ k }}</kbd>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="hint">{{ t.shortcutsHint }}</p>
    </app-modal>
  `,
  styles: `
    .list {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 3px var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
    th {
      padding: var(--space-2) var(--space-2) 3px;
      text-align: left;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .keys {
      text-align: right;
      white-space: nowrap;
    }
    kbd + kbd {
      margin-left: var(--space-1);
    }
    .hint {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortcutsDialog {
  protected readonly dialogs = inject(DialogService);
  private readonly actions = inject(ActionService);
  protected readonly t = MENUS_TEXTS;
  protected readonly query = signal('');

  private readonly all = computed(() =>
    [...ACTIONS]
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .map((def) => ({
        id: def.id,
        group: def.group,
        label: this.actions.label(def.id),
        keys: this.actions.chords(def.id).map((c) => formatChord(c, this.actions.os)),
      }))
      .filter((r) => r.keys.length > 0),
  );

  protected readonly rows = computed(() => {
    const q = this.query().toLowerCase();
    const found = this.all().filter(
      (r) => matches(r, this.query()) || r.keys.some((k) => k.toLowerCase().includes(q)),
    );
    return found.map((r, i) => ({ ...r, first: i === 0 || found[i - 1].group !== r.group }));
  });
}
