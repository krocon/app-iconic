import { IconFormat } from '../../core/icon-file/icon-file.models';
import { AskService } from '../../shared/ask/ask.service';
import { FILES_TEXTS as T } from './files-texts';

/** The questions of the file actions (split from `files.service.ts` in prompt 083). */

/** "Save changes to …?" – `save`, `discard` or `cancel`. */
export async function askSaveChanges(
  ask: AskService,
  title: string,
): Promise<'save' | 'discard' | 'cancel'> {
  const answer = await ask.ask({
    title: T.saveChangesTitle(title),
    message: T.saveChangesMessage,
    buttons: [
      { id: 'discard', label: T.dontSaveButton },
      { id: 'cancel', label: T.cancelButton },
      { id: 'save', label: T.saveButton, primary: true },
    ],
    cancel: 'cancel',
  });
  return answer === 'save' || answer === 'discard' ? answer : 'cancel';
}

/** Bundle or ZIP for "Save As"; `null` = cancelled. */
export async function askFormat(ask: AskService, current: IconFormat): Promise<IconFormat | null> {
  const answer = await ask.ask({
    title: T.formatTitle,
    message: T.formatMessage,
    buttons: [
      { id: 'cancel', label: T.cancelButton },
      { id: 'zip', label: T.formatZip, primary: current === 'zip' },
      { id: 'bundle', label: T.formatBundle, primary: current === 'bundle' },
    ],
    cancel: 'cancel',
  });
  return answer === 'bundle' || answer === 'zip' ? answer : null;
}

/** A message with "OK". */
export async function inform(ask: AskService, title: string, message: string): Promise<void> {
  await ask.ask({
    title,
    message,
    buttons: [{ id: 'ok', label: T.okButton, primary: true }],
    cancel: 'ok',
  });
}
