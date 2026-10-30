import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { CornersService } from './corners.service';

/**
 * Live Corners (prompt 045): with `radius` / `kind` at once, else the dialog. Split from `app.ts`
 * in prompt 082.
 */
export function registerCornersActions(
  actions: ActionService,
  corners: CornersService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'corners.set': {
        run: (a) => {
          const args = a as
            { radius?: number; kind?: 'round' | 'inverted' | 'chamfer' } | undefined;
          if (args?.radius === undefined) {
            dialogs.show('corners');
            return true;
          }
          return corners.apply(args.radius, args.kind ?? 'round');
        },
        enabled: () => corners.canApply(),
      },
    },
    destroyRef,
  );
}
