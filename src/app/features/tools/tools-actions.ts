import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { AddService } from '../commands/add.service';
import { SymbolService } from '../symbols/symbol.service';
import { FreehandService } from './freehand.service';
import { TextPathService } from './text-path.service';

type Args = Record<string, unknown> | undefined;

/**
 * The tool actions (design 013): Freehand (without arguments the tool on/off, with `points`
 * directly – AI), its open/closed toggle (`C` while the tool is on), Text to Path (dialog or
 * `{ text, font … }`) and Symbol (picker or `{ id … }`).
 */
export function registerToolActions(
  actions: ActionService,
  add: AddService,
  freehand: FreehandService,
  textPath: TextPathService,
  symbols: SymbolService,
  destroyRef?: DestroyRef,
  /** Switches the sketch tool off when freehand comes on (one tool at a time, design 019 E3). */
  stopSketch?: () => void,
): void {
  const enabled = () => add.canAdd();
  actions.registerAll(
    {
      'add.freehand': {
        run: (a) => {
          const args = a as Args;
          if (args?.['points'] !== undefined) return freehand.insertFromArgs(args);
          if (!freehand.tool.active()) stopSketch?.();
          freehand.tool.toggle();
          return undefined;
        },
        enabled,
        checked: () => freehand.tool.active(),
      },
      'freehand.toggleClosed': {
        run: () => freehand.tool.closed.update((c) => !c),
        enabled: () => freehand.tool.active(),
      },
      'add.textToPath': {
        run: (a) => {
          const args = a as Args;
          if (typeof args?.['text'] === 'string') return textPath.addFromArgs(args);
          textPath.openDialog();
          return undefined;
        },
        enabled,
      },
      'add.symbol': {
        run: (a) => {
          const args = a as Args;
          if (typeof args?.['id'] === 'string') return symbols.addFromArgs(args);
          symbols.openPicker();
          return undefined;
        },
        enabled,
      },
    },
    destroyRef,
  );
}
