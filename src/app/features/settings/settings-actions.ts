import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { checkedValue } from '../../core/settings/settings-rules';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { SETTINGS_TEXTS } from './settings-texts';
import { SettingsStore } from './settings.store';

/** Asks first, then resets every setting (design 015 E12); `true` = reset. */
export async function confirmReset(ask: AskService, store: SettingsStore): Promise<boolean> {
  const t = SETTINGS_TEXTS;
  const answer = await ask.ask({
    title: t.resetTitle,
    message: t.resetMessage,
    buttons: [
      { id: 'cancel', label: t.cancel },
      { id: 'reset', label: t.resetButton, primary: true },
    ],
    cancel: 'cancel',
  });
  if (answer !== 'reset') return false;
  await store.reset();
  return true;
}

/**
 * The settings as actions (design 015 E11): the dialog (⌘,), `settings.set { key, value }` – the
 * AI changes what the dialog changes – and `settings.reset { confirm? }`.
 */
export function registerSettingsActions(
  actions: ActionService,
  store: SettingsStore,
  dialogs: DialogService,
  ask: AskService,
  destroyRef?: DestroyRef,
): void {
  const noDialog = () => dialogs.open() === null;
  actions.registerAll(
    {
      'app.settings': { run: () => dialogs.show('settings'), enabled: noDialog },
      'settings.set': {
        run: (args) => {
          const { key, value } = args as { key: string; value: unknown };
          store.set(key, value);
        },
        // a key or value that does not fit is refused (`run` returns false)
        enabled: (args) => {
          if (args === undefined) return true;
          const { key, value } = args as { key: string; value: unknown };
          return checkedValue(store.settings(), key, value) !== null;
        },
      },
      'settings.reset': {
        run: (args) => {
          if ((args as { confirm?: boolean } | undefined)?.confirm === false) return store.reset();
          return confirmReset(ask, store);
        },
        enabled: noDialog,
      },
    },
    destroyRef,
  );
}
