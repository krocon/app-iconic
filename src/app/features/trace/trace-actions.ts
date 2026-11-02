import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { TraceService } from './trace.service';

/**
 * "Trace Image" (prompt 087): `trace.image` opens the dialog with the best source (selected PNG
 * layer, template, file); with arguments it traces at once (AI: `source` template or layer, a
 * preset, changes – design 087 E15). `trace.clipboard` opens the dialog with the clipboard image.
 */
export function registerTraceActions(
  actions: ActionService,
  trace: TraceService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'trace.image': {
        run: (args) =>
          args === undefined ? trace.open() : trace.run(args as Record<string, unknown>),
        enabled: () => trace.canTrace(),
      },
      'trace.clipboard': {
        run: () => trace.open('clipboard'),
        enabled: () => trace.canTrace(),
      },
    },
    destroyRef,
  );
}
