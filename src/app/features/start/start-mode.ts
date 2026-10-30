import { StartupChoice } from '../../core/settings/settings.models';

/**
 * How a window starts (design 082 E1), pure:
 * - `file`: it was opened for a file (argv, Finder, second start – design 030; a new window with a
 *   path) – no start screen;
 * - `action`: it was opened for an action (a menu click without a window, design 005 E6, e.g.
 *   "Open Recent") – an empty document as before, then the action; no start screen;
 * - `screen` / `empty`: nothing given – the setting `startup` decides.
 */
export type StartMode = 'file' | 'action' | 'screen' | 'empty';

export function startMode(input: {
  path: string | null;
  action: string | null;
  startup: StartupChoice;
}): StartMode {
  if (input.path) return 'file';
  if (input.action) return 'action';
  return input.startup === 'emptyDocument' ? 'empty' : 'screen';
}
