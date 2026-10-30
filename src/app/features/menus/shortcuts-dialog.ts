import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { buildKeymap } from '../../core/actions/keymap';
import { chordMap } from '../../core/actions/keymap-edit';
import { Os } from '../../core/actions/platform';
import { describeFsError } from '../../core/errors/fs-error';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { KeymapEditor } from './keymap-editor';
import { MENUS_TEXTS } from './menus-texts';
import { ShortcutRow } from './shortcut-row';
import { shortcutRows } from './shortcuts-model';

/**
 * All shortcuts, and where they are changed (design 005 E9, ⌘/; taken over from editlicious
 * `shortcuts-dialog.ts`; editor since prompt 085 E7): every action a key can run with its
 * shortcuts, grouped by menu, filterable by name or shortcut; per OS (the own one editable, the
 * other read-only with the same `keymap.json`), only changed ones, Reset All.
 */
@Component({
  selector: 'app-shortcuts-dialog',
  imports: [Modal, ShortcutRow],
  template: `
    <app-modal [heading]="t.shortcutsTitle" width="44rem" height="80vh" (closed)="dialogs.close()">
      <div class="bar">
        <input
          class="input filter"
          type="search"
          data-autofocus
          spellcheck="false"
          [attr.aria-label]="t.shortcutsFilter"
          [placeholder]="t.shortcutsFilter"
          (input)="query.set($any($event.target).value)"
        />
        <span class="seg" role="radiogroup" [attr.aria-label]="t.shortcutsFor">
          @for (o of oses; track o) {
            <button
              type="button"
              role="radio"
              class="btn"
              [class.on]="view() === o"
              [attr.aria-checked]="view() === o"
              [attr.data-os]="o"
              (click)="view.set(o)"
            >
              {{ o === 'mac' ? t.osMac : t.osOther }}
            </button>
          }
        </span>
        <label class="only">
          <input
            type="checkbox"
            [checked]="onlyChanged()"
            (change)="onlyChanged.set($any($event.target).checked)"
          />
          {{ t.onlyChanged }}
        </label>
      </div>
      @if (!own()) {
        <p class="hint">{{ t.readOnly }}</p>
      }
      @if (editor.error(); as e) {
        <p class="error" role="alert">{{ describe(e) }}</p>
      }
      <div class="list" role="region" tabindex="0" [attr.aria-label]="t.shortcutsTitle">
        @for (r of rows(); track r.id) {
          @if (r.first) {
            <h3 class="head">{{ t.groups[r.group] }}</h3>
          }
          <app-shortcut-row [row]="r" [attr.data-action]="r.id" />
        } @empty {
          <p class="hint">{{ t.noMatch }}</p>
        }
      </div>
      <div class="foot">
        <p class="hint">{{ t.shortcutsHint }}</p>
        @if (confirming()) {
          <span class="confirm" role="group" [attr.aria-label]="t.resetAllConfirm">
            {{ t.resetAllConfirm }}
            <button type="button" class="btn primary reset-yes" (click)="resetAll()">
              {{ t.resetAllButton }}
            </button>
            <button type="button" class="btn reset-no" (click)="confirming.set(false)">
              {{ t.cancel }}
            </button>
          </span>
        } @else {
          <button
            type="button"
            class="btn reset-all"
            [disabled]="!own() || !editor.changed()"
            (click)="confirming.set(true)"
          >
            {{ t.resetAll }}
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .filter {
      flex: 1;
    }
    .seg {
      display: inline-flex;

      & .btn {
        border-radius: 0;
      }
      & .btn:first-child {
        border-radius: var(--radius) 0 0 var(--radius);
      }
      & .btn:last-child {
        border-radius: 0 var(--radius) var(--radius) 0;
        margin-left: -1px;
      }
      & .btn.on {
        color: var(--color-accent-text);
        background: var(--color-accent);
        border-color: var(--color-accent);
      }
    }
    .only {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      white-space: nowrap;
    }
    .list {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .head {
      margin: 0;
      padding: var(--space-2) var(--space-2) 3px;
      font-size: var(--font-size-small);
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .foot {
      display: flex;
      align-items: center;
      gap: var(--space-2);

      & .hint {
        flex: 1;
      }
    }
    .confirm {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .hint,
    .error {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .error {
      color: var(--color-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortcutsDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly editor = inject(KeymapEditor);
  private readonly actions = inject(ActionService);
  protected readonly t = MENUS_TEXTS;
  protected readonly oses: readonly Os[] = ['mac', 'other'];
  protected readonly query = signal('');
  protected readonly onlyChanged = signal(false);
  protected readonly confirming = signal(false);
  /** The OS shown (design 085 E7). */
  protected readonly view = signal<Os>(this.actions.os);
  protected readonly own = computed(() => this.view() === this.actions.os);
  protected readonly describe = describeFsError;

  /** The other OS: the same `keymap.json` laid over its keymaps. */
  private readonly map = computed(() =>
    this.own() ? this.editor.map() : chordMap(buildKeymap(this.view(), this.actions.overrides())),
  );

  protected readonly rows = computed(() =>
    shortcutRows({
      os: this.view(),
      editable: this.own(),
      map: this.map(),
      label: (id) => this.actions.label(id),
      query: this.query(),
      onlyChanged: this.onlyChanged(),
    }),
  );

  protected async resetAll(): Promise<void> {
    this.confirming.set(false);
    await this.editor.resetAll();
  }
}
