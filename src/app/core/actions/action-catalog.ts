import { ActionDef } from './catalog/action-def';
import { ADD_ACTIONS } from './catalog/add-actions';
import { APP_FILE_ACTIONS } from './catalog/app-file-actions';
import { ARRANGE_ACTIONS } from './catalog/arrange-actions';
import { EDIT_ACTIONS } from './catalog/edit-actions';
import { MODIFY_ACTIONS } from './catalog/modify-actions';
import { VIEW_ACTIONS } from './catalog/view-actions';

export type { ActionContext, ActionDef, ActionGroup } from './catalog/action-def';
export { MAX_RECENT_ACTIONS, NUDGES } from './catalog/action-def';

/**
 * Every function of the app as an action (design 005 E1; taken over from editlicious
 * `core/actions/action-catalog.ts`, there from comic-commander design 008): id, text, context and
 * menu group. Shortcuts live in the keymaps (`keymap.*.json`), handlers are registered by the
 * features (`ActionService`). Menus, the command palette, the keyboard – and the AI over MCP
 * (prompt 018) – all run actions by id. Entries whose function a later prompt brings stand here
 * already; without a handler they are disabled. Texts: English = source, German in
 * `action-catalog.de.ts` (design 015 E13).
 */

/** The parts live in `catalog/` per area (prompt 033); the order is the one of the menus. */
export const ACTIONS: readonly ActionDef[] = [
  ...APP_FILE_ACTIONS,
  ...EDIT_ACTIONS,
  ...MODIFY_ACTIONS,
  ...VIEW_ACTIONS,
  ...ADD_ACTIONS,
  ...ARRANGE_ACTIONS,
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}
