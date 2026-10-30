import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { actionDef } from '../../core/actions/action-catalog';
import { editable } from '../../core/actions/keymap-edit';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { KeymapEditor } from './keymap-editor';
import { MENUS_TEXTS } from './menus-texts';

/** Asks first, then puts every shortcut back (design 085 E8); `true` = reset. */
export async function confirmResetShortcuts(
  ask: AskService,
  editor: KeymapEditor,
): Promise<boolean> {
  const t = MENUS_TEXTS;
  const answer = await ask.ask({
    title: t.resetAllTitle,
    message: t.resetAllMessage,
    buttons: [
      { id: 'cancel', label: t.cancel },
      { id: 'reset', label: t.resetAllButton, primary: true },
    ],
    cancel: 'cancel',
  });
  return answer === 'reset' && editor.resetAll();
}

/**
 * The shortcut editor as actions (design 085 E8, AI rule): `keymap.set { action, chords }` and
 * `keymap.reset { action?, confirm? }`. Both are closed to the AI (`mcp-policy`).
 */
export function registerKeymapActions(
  actions: ActionService,
  editor: KeymapEditor,
  ask: AskService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  const changeable = (id: unknown) =>
    typeof id === 'string' && !!actionDef(id) && editable(editor.os, id);
  actions.registerAll(
    {
      'keymap.set': {
        run: (args) => {
          const { action, chords } = args as { action: string; chords: string[] };
          return editor.set(action, chords);
        },
        enabled: (args) => {
          if (args === undefined) return true;
          const { action, chords } = args as { action: unknown; chords: unknown };
          return (
            changeable(action) &&
            Array.isArray(chords) &&
            chords.length <= 8 &&
            chords.every((c) => typeof c === 'string' && c.length <= 40)
          );
        },
      },
      'keymap.reset': {
        run: (args) => {
          const { action, confirm } = (args ?? {}) as { action?: string; confirm?: boolean };
          if (action !== undefined) return editor.reset(action);
          return confirm === false ? editor.resetAll() : confirmResetShortcuts(ask, editor);
        },
        enabled: (args) => {
          const { action, confirm } = (args ?? {}) as { action?: unknown; confirm?: boolean };
          if (action !== undefined) return changeable(action);
          return confirm === false || dialogs.open() === null;
        },
      },
    },
    destroyRef,
  );
}
