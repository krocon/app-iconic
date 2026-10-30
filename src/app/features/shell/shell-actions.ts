import { DestroyRef, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { registerFileActions } from '../files/file-actions';
import { FilesService } from '../files/files.service';
import { RecentFilesService } from '../files/recent-files.service';
import { registerAppActions } from '../menus/app-actions';
import { registerKeymapActions } from '../menus/keymap-actions';
import { KeymapEditor } from '../menus/keymap-editor';
import { registerRecoveryActions } from '../recovery/recovery-actions';
import { RecoveryService } from '../recovery/recovery.service';
import { registerStartActions } from '../start/start-actions';
import { StartService } from '../start/start.service';
import { ThumbnailService } from '../start/thumbnail.service';
import { LayoutStore } from './layout.store';

/**
 * The actions of the window shell – files, start screen (082), recovery (083), palette/panels
 * (005) and shortcuts (085). Split from `app.ts` in prompt 085; call in an injection context.
 */
export function registerShellActions(
  actions: ActionService,
  files: FilesService,
  dialogs: DialogService,
  destroyRef: DestroyRef,
): void {
  registerFileActions(actions, files, inject(RecentFilesService), destroyRef);
  registerStartActions(actions, inject(StartService), files, destroyRef);
  inject(ThumbnailService); // previews of opened/saved files (prompt 082)
  // recovery snapshots of unsaved changes, the offer at start (prompt 083)
  registerRecoveryActions(actions, inject(RecoveryService), files, destroyRef);
  registerAppActions(actions, dialogs, inject(LayoutStore), files, destroyRef);
  registerKeymapActions(actions, inject(KeymapEditor), inject(AskService), dialogs, destroyRef);
}
