import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { LineJoin } from '../../shared/geometry/pathops/offset';
import { OffsetService } from './offset.service';

/**
 * The actions of prompt 052: `path.offset` – with `distance` at once (the AI's way), else the
 * dialog – and `path.outlineStroke`.
 */
export function registerOffsetActions(
  actions: ActionService,
  service: OffsetService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'path.offset': {
        run: (args) => {
          const a = args as Record<string, unknown> | undefined;
          const distance = a?.['distance'];
          if (typeof distance !== 'number') {
            dialogs.show('offset');
            return true;
          }
          const join = (['miter', 'round', 'bevel'] as const).find((j) => j === a?.['join']);
          return service.offset({
            distance,
            join: (join ?? 'round') as LineJoin,
            replace: a?.['replace'] === true,
          });
        },
        enabled: () => service.canRun(),
      },
      'path.outlineStroke': {
        run: () => service.outlineStroke(),
        enabled: () => service.canRun(),
      },
    },
    destroyRef,
  );
}
