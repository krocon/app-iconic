import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { COLOR_TEXTS as T } from './color-texts';
import { replaceColorCommand } from './document-colors';
import { Eyedropper, PickTarget } from './eyedropper';

/**
 * The actions of prompt 074: `color.eyedropper` (Shift+I, a canvas tool), `color.pick { x, y,
 * target? }` (document coordinates, `fill` or `stroke` – the AI's eyedropper), `color.replace
 * { from, to }` (the whole icon, one undo step).
 */
export function registerColorActions(
  actions: ActionService,
  eyedropper: Eyedropper,
  tools: CanvasTools,
  freehand: FreehandStore,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'color.eyedropper': {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('eyedropper');
          eyedropper.toggle();
        },
        checked: () => eyedropper.on(),
        enabled: () => !!files.store(),
      },
      'color.pick': {
        run: (a) => {
          const o = (a ?? {}) as { x?: unknown; y?: unknown; target?: unknown };
          if (typeof o.x !== 'number' || typeof o.y !== 'number') return false;
          const target: PickTarget = o.target === 'stroke' ? 'stroke' : 'fill';
          return eyedropper.pickAt(o.x, o.y, target);
        },
        enabled: () => !!files.store(),
      },
      'color.replace': {
        run: (a) => {
          const o = (a ?? {}) as { from?: unknown; to?: unknown };
          const store = files.store();
          if (!store || typeof o.from !== 'string' || typeof o.to !== 'string') return false;
          const cmd = replaceColorCommand(store.document(), o.from, o.to);
          if (!cmd) {
            files.notice.set(T.replaceNothing);
            return false;
          }
          store.execute(cmd);
          return true;
        },
        enabled: () => !!files.store(),
      },
    },
    destroyRef,
  );
}
