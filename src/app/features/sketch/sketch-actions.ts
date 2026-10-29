import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { SKETCH_TOOL_IDS, SketchToolId } from '../../shared/geometry/sketch/sketch-tools';
import { AddService } from '../commands/add.service';
import { SketchService } from './sketch.service';

type Args = Record<string, unknown> | undefined;

/** Action id of a sketch tool (`sketch.rect3p`). */
export const sketchActionId = (tool: SketchToolId): string => `sketch.${tool}`;

/**
 * The sketch actions (design 019 E1, E14): without arguments the mouse tool on/off (checked while
 * on), with `points` (and `values`) the shape is drawn directly – the AI's way.
 */
export function registerSketchActions(
  actions: ActionService,
  add: AddService,
  sketch: SketchService,
  destroyRef?: DestroyRef,
  /** The pen: Space moves its anchor too (prompt 042). */
  pen?: { dragging(): boolean; setSpaceMove(on: boolean): void },
): void {
  const handlers = Object.fromEntries(
    SKETCH_TOOL_IDS.map((tool): [string, ActionHandler] => [
      sketchActionId(tool),
      {
        run: (a) => {
          const args = a as Args;
          if (args?.['points'] !== undefined) return sketch.insertFromArgs(tool, args);
          sketch.toggle(tool);
          return undefined;
        },
        enabled: () => add.canAdd(),
        checked: () => sketch.tool.tool() === tool,
      },
    ]),
  );
  actions.registerAll(handlers, destroyRef);
  // keys of a drag (prompt 041): only while one runs
  const store = sketch.tool;
  actions.registerAll(
    {
      'sketch.sidesUp': {
        run: () => store.stepSides(1),
        enabled: () => store.dragging() && store.tool() === 'dragPolygon',
      },
      'sketch.sidesDown': {
        run: () => store.stepSides(-1),
        enabled: () => store.dragging() && store.tool() === 'dragPolygon',
      },
      'sketch.moveHold': {
        run: () => {
          store.setSpaceMove(true);
          pen?.setSpaceMove(true);
        },
        release: () => {
          store.setSpaceMove(false);
          pen?.setSpaceMove(false);
        },
        enabled: () => store.dragging() || !!pen?.dragging(),
      },
    },
    destroyRef,
  );
}
