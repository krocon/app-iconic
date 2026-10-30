import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FilesService } from '../files/files.service';
import { RecoveryService } from './recovery.service';

/** File › Recover Unsaved Documents… (prompt 083 E5) – for the AI blocked like every `file.` action. */
export function registerRecoveryActions(
  actions: ActionService,
  recovery: RecoveryService,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    { 'file.recover': { run: () => recovery.show(), enabled: () => !files.busy() } },
    destroyRef,
  );
}
