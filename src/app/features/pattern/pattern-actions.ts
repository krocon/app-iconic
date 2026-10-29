import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTools } from '../canvas/canvas-tools';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { constructionCommand } from '../construction/construction';
import { PatternService } from './pattern.service';
import { PatternTool } from './pattern-tool';
import { PATTERN_TEXTS as T } from './pattern-texts';

type Args = Record<string, unknown> | undefined;

const point = (v: unknown): Point | null =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && isFinite(x))
    ? { x: v[0] as number, y: v[1] as number }
    : null;

const num = (a: Args, k: string, d: number): number => {
  const v = a?.[k];
  return typeof v === 'number' && isFinite(v) ? v : d;
};

/**
 * The actions of prompt 049: `pattern.circular` / `pattern.rectangular` / `pattern.mirror` – with
 * arguments at once (the AI's way), without them the canvas pick or the dialog; `edit.cloneLinked`
 * and `edit.toggleConstruction` (X).
 */
export function registerPatternActions(
  actions: ActionService,
  service: PatternService,
  tool: PatternTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  files: FilesService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  const pick = (mode: 'center' | 'mirror') => {
    if (!service.canRun()) {
      files.notice.set(T.needSelection);
      return false;
    }
    freehand.toggle(false);
    tools.stopAll('pattern');
    tool.start(mode);
    return true;
  };
  actions.registerAll(
    {
      'pattern.circular': {
        run: (a: Args) => {
          if (a?.['count'] === undefined) return pick('center');
          return service.circular({
            center: point(a['center']) ?? service.center(),
            count: num(a, 'count', 6),
            angle: num(a, 'angle', 360),
          });
        },
        enabled: () => service.canRun(),
      },
      'pattern.rectangular': {
        run: (a: Args) => {
          if (a?.['columns'] === undefined && a?.['rows'] === undefined) {
            tools.stopAll();
            service.dialog.set({ kind: 'rectangular' });
            dialogs.show('pattern');
            return true;
          }
          const b = service.bounds();
          return service.rectangular({
            columns: num(a, 'columns', 1),
            rows: num(a, 'rows', 1),
            dx: num(a, 'dx', (b?.width ?? 100) * 1.25),
            dy: num(a, 'dy', (b?.height ?? 100) * 1.25),
          });
        },
        enabled: () => service.canRun(),
      },
      'pattern.mirror': {
        run: (a: Args) => {
          const p = point(a?.['a']);
          const q = point(a?.['b']);
          return p && q ? service.mirror(p, q) : pick('mirror');
        },
        enabled: () => service.canRun(),
      },
      'pattern.centerHere': {
        run: () => tool.confirm(),
        enabled: () => tool.mode() === 'center',
      },
      'edit.cloneLinked': { run: () => service.clone(), enabled: () => service.canRun() },
      'edit.toggleConstruction': {
        run: () => {
          const store = files.store();
          const cmd = store ? constructionCommand(store.document(), store.selection()) : null;
          if (!store || !cmd) return false;
          store.execute(cmd);
          return true;
        },
        enabled: () => !!files.store()?.selection().length,
      },
    },
    destroyRef,
  );
}
