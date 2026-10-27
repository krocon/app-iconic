import { DestroyRef } from '@angular/core';
import { MAX_RECENT_ACTIONS } from '../../core/actions/action-catalog';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { UNDO_TEXTS } from '../document/undo/undo-texts';
import { FilesService } from './files.service';
import { RecentFilesService } from './recent-files.service';

/**
 * The file and undo actions of the window (design 005 E17, legacy §4): New Window, New, Open,
 * Open Recent, Import SVG, Save, Save As, Close, Quit, Undo/Redo with the action's name.
 */
export function registerFileActions(
  actions: ActionService,
  files: FilesService,
  recent: RecentFilesService,
  destroyRef?: DestroyRef,
): void {
  const store = files.store;
  const idle = () => !files.busy();
  const recentEntry = (i: number): ActionHandler => ({
    run: () => {
      const f = recent.files()[i];
      if (f) void files.openRecent(f.path);
    },
    enabled: () => idle() && i < recent.files().length,
    label: () => recent.files()[i]?.name ?? `${i + 1}`,
  });
  const handlers: Record<string, ActionHandler> = {
    'file.newWindow': { run: () => files.newWindow() },
    'file.new': { run: () => files.newDocument(), enabled: idle },
    'file.open': { run: () => files.open(), enabled: idle },
    'file.clearRecent': {
      run: () => recent.clear(),
      enabled: () => recent.files().length > 0,
    },
    'file.importSvg': { run: () => files.importSvg(), enabled: () => idle() && !!store() },
    'file.save': {
      run: () => files.save(),
      enabled: () => {
        const s = store();
        return idle() && !!s && (s.dirty() || s.document().path === null);
      },
    },
    'file.saveAs': { run: () => files.saveAs(), enabled: () => idle() && !!store() },
    'file.close': { run: () => files.close(), enabled: idle },
    'app.quit': { run: () => files.quit() },
    'edit.undo': {
      run: () => files.undo(),
      enabled: () => !!store()?.canUndo(),
      label: () => store()?.undoLabel() ?? UNDO_TEXTS.undo,
    },
    'edit.redo': {
      run: () => files.redo(),
      enabled: () => !!store()?.canRedo(),
      label: () => store()?.redoLabel() ?? UNDO_TEXTS.redo,
    },
  };
  for (let i = 0; i < MAX_RECENT_ACTIONS; i++) handlers[`file.recent.${i + 1}`] = recentEntry(i);
  actions.registerAll(handlers, destroyRef);
}
