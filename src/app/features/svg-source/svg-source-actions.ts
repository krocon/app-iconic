import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { SvgSourceService } from './svg-source.service';

/**
 * The actions of design 011 (E12, E13): `edit.editSvg { markup? }` – without `markup` the dialog
 * for the selection, with it the target replaced directly (AI); `path.optimize { epsilon?,
 * precision? }` – without arguments the preview dialog, with them straight away (AI).
 */
export function registerSvgSourceActions(
  actions: ActionService,
  service: SvgSourceService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'edit.editSvg': {
        run: (a) => {
          const markup = (a as { markup?: string } | undefined)?.markup;
          if (typeof markup === 'string') service.applyToSelection(markup);
          else service.openDialog();
        },
        enabled: () => service.target() !== null,
      },
      'path.optimize': {
        run: (a) => {
          const o = a as { epsilon?: number; precision?: number } | undefined;
          if (o && (o.epsilon !== undefined || o.precision !== undefined)) service.optimize(o);
          else service.openOptimizeDialog();
        },
        enabled: () => service.canOptimize(),
      },
    },
    destroyRef,
  );
}
