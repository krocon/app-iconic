import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { PathEditService } from './path-edit.service';
import { PATH_MODES, PathEditTool, PathMode } from './path-edit-tool';

/** The action id of a path tool mode. */
export const pathModeAction = (m: PathMode) => `path.${m}`;

/**
 * The path tools' actions (prompt 046): one toggle per tool (checked while on; the other tools
 * go off), `path.join` (⌘J) joins the two nearest open ends of the selected paths,
 * `path.convert` turns the selected shapes into paths.
 */
export function registerPathEditActions(
  actions: ActionService,
  service: PathEditService,
  tool: PathEditTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const toggles = Object.fromEntries(
    PATH_MODES.map((m) => [
      pathModeAction(m),
      {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('pathEdit');
          tool.toggle(m);
        },
        enabled: () => service.targets().length > 0 || tool.mode() === m,
        checked: () => tool.mode() === m,
      },
    ]),
  );
  actions.registerAll(
    {
      ...toggles,
      'path.join': { run: () => service.join(), enabled: () => service.canJoin() },
      'path.convert': { run: () => service.convert(), enabled: () => service.canConvert() },
    },
    destroyRef,
  );
}
