import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { PATHFINDER_OPS } from '../../shared/geometry/pathops/boolean-ops';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { CUT_MODES, CutTool } from './cut-tool';
import { PathfinderService } from './pathfinder.service';
import { ShapeBuilderTool } from './shape-builder-tool';

/**
 * The actions of prompt 047: `pathfinder.<op>` and `pathfinder.divide` on the selected shapes,
 * the tools `shapeBuilder.tool` (⇧M) and `cut.<mode>` (on/off; the other tools go off).
 */
export function registerPathfinderActions(
  actions: ActionService,
  service: PathfinderService,
  builder: ShapeBuilderTool,
  cut: CutTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const ops = Object.fromEntries(
    PATHFINDER_OPS.map((op) => [
      `pathfinder.${op}`,
      { run: () => service.run(op), enabled: () => service.canRun() },
    ]),
  );
  const cuts = Object.fromEntries(
    CUT_MODES.map((m) => [
      `cut.${m}`,
      {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('cut');
          cut.toggle(m);
        },
        enabled: () => service.canRun(1) || cut.mode() === m,
        checked: () => cut.mode() === m,
      },
    ]),
  );
  actions.registerAll(
    {
      ...ops,
      ...cuts,
      'pathfinder.divide': { run: () => service.divide(), enabled: () => service.canRun() },
      'shapeBuilder.tool': {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('shapeBuilder');
          builder.toggle();
        },
        enabled: () => service.canRun(1) || builder.on(),
        checked: () => builder.on(),
      },
    },
    destroyRef,
  );
}
