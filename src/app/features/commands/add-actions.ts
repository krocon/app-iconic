import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { AddService } from './add.service';
import { SHAPE_KINDS, ShapeKind } from './element-defaults';

/**
 * The "Add" actions (design 008): every entry of the Add menu, the command sidebar and the palette
 * – and of the AI – runs through these handlers. Freehand, Text to Path and Symbol: see
 * `features/tools/tools-actions.ts` (prompt 013).
 */

/** Action id → shape. */
export const SHAPE_ACTIONS: Record<string, ShapeKind> = {
  'add.container': 'container',
  'add.circle': 'circle',
  'add.ellipse': 'ellipse',
  'add.rect': 'rect',
  'add.path': 'path',
  'add.line': 'line',
  'add.polyline': 'polyline',
  'add.polygon': 'polygon',
  'add.text': 'text',
};

type Args = Record<string, unknown> | undefined;

export function registerAddActions(
  actions: ActionService,
  add: AddService,
  destroyRef?: DestroyRef,
): void {
  const enabled = () => add.canAdd();
  const shapes = Object.fromEntries(
    Object.entries(SHAPE_ACTIONS)
      .filter(([, k]) => SHAPE_KINDS.includes(k))
      .map(([id, kind]): [string, ActionHandler] => [
        id,
        { run: (a) => add.addShape(kind, a as Args), enabled },
      ]),
  );
  actions.registerAll(
    {
      ...shapes,
      'add.iconGroup': { run: () => add.addIconGroup(), enabled },
      'add.layer': { run: () => add.addLayer(), enabled },
      'add.image': { run: (a) => add.addImage(a as Args), enabled },
      'add.svgSnippet': {
        run: (a) => {
          const args = a as Args;
          if (typeof args?.['markup'] === 'string') {
            return add.addSnippet(args['markup'], args).then((e) => {
              if (e) add.report(e);
              return e;
            });
          }
          add.openSnippetDialog();
          return undefined;
        },
        enabled,
      },
    },
    destroyRef,
  );
}
