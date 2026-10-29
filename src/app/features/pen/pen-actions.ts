import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { AddService } from '../commands/add.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { PenService } from './pen.service';

/**
 * The pen's actions (prompt 042): `pen.tool` without arguments switches it on/off (checked while
 * on; the other tools go off), with `anchors` it draws the path at once (the AI's way);
 * `pen.finish` (Enter) ends the path being drawn.
 */
export function registerPenActions(
  actions: ActionService,
  add: AddService,
  pen: PenService,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'pen.tool': {
        run: (a) => {
          const args = a as Record<string, unknown> | undefined;
          if (args?.['anchors'] !== undefined) return pen.insertFromArgs(args);
          freehand.toggle(false);
          tools.stopAll('pen');
          pen.pen.toggle();
          return undefined;
        },
        enabled: () => add.canAdd(),
        checked: () => pen.pen.on(),
      },
      'pen.finish': {
        run: () => void pen.finish(),
        enabled: () => pen.pen.on() && pen.pen.anchors().length >= 2,
      },
    },
    destroyRef,
  );
}
