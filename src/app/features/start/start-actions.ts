import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FilesService } from '../files/files.service';
import { isTemplateId } from './start-templates';
import { StartService } from './start.service';

/**
 * File › New from Template… and the start screen (design 082 E8): without `template` the start
 * screen with the focus on the templates, with one the new untitled document at once.
 */
export function registerStartActions(
  actions: ActionService,
  start: StartService,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  const idle = () => !files.busy();
  actions.registerAll(
    {
      'file.newFromTemplate': {
        run: (a) => {
          const id = (a as { template?: unknown } | undefined)?.template;
          if (id === undefined) return start.show('templates');
          if (!isTemplateId(id)) return false;
          return start.openTemplate(id);
        },
        enabled: idle,
      },
      'file.startScreen': { run: () => start.show('recent'), enabled: idle },
    },
    destroyRef,
  );
}
