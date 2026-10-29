import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { AddService } from '../commands/add.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { CurvatureService } from './curvature.service';
import { PenService } from './pen.service';

/**
 * The pen's actions (prompt 042): `pen.tool` without arguments switches it on/off (checked while
 * on; the other tools go off), with `anchors` it draws the path at once (the AI's way);
 * `pen.finish` (Enter) ends the path being drawn (pen or curvature); `curvature.tool` and
 * `curvature.removePoint` (Backspace) of prompt 043.
 */
export function registerPenActions(
  actions: ActionService,
  add: AddService,
  pen: PenService,
  tools: CanvasTools,
  freehand: FreehandStore,
  curvature: CurvatureService,
  destroyRef?: DestroyRef,
): void {
  const c = curvature.curvature;
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
        run: () => void (pen.pen.on() ? pen.finish() : curvature.finish()),
        enabled: () =>
          (pen.pen.on() && pen.pen.anchors().length >= 2) || (c.on() && c.points().length >= 2),
      },
      'curvature.tool': {
        run: (a) => {
          const args = a as Record<string, unknown> | undefined;
          if (args?.['points'] !== undefined) return curvature.insertFromArgs(args);
          freehand.toggle(false);
          tools.stopAll('curvature');
          c.toggle();
          return undefined;
        },
        enabled: () => add.canAdd(),
        checked: () => c.on(),
      },
      'curvature.removePoint': {
        run: () => {
          if (c.remove()) curvature.commitEdit();
        },
        enabled: () => c.on() && (c.drawing() || c.edit()?.current !== null),
      },
    },
    destroyRef,
  );
}
