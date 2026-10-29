import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { ANCHORS, Anchor, IDENTITY_SPEC, Reflect } from '../../shared/geometry/transform-ops';
import { CanvasTools } from '../canvas/canvas-tools';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { Pivot, TransformService } from './transform.service';
import { TransformMode, TransformTool } from './transform-tool';
import { TRANSFORM_TEXTS as T } from './transform-texts';

const num = (a: Record<string, unknown>, k: string, d: number) =>
  typeof a[k] === 'number' && isFinite(a[k] as number) ? (a[k] as number) : d;

/**
 * The actions of prompt 053: the tools `transform.rotate` (⇧R), `transform.scale` (⇧S),
 * `transform.reflect` (⇧O); `transform.dialog` (⌘⇧M); `transform.apply { dx, dy, rotate, sx, sy,
 * reflect, pivot, each, copy }` at once (the AI's way; `pivot` = [x, y] or an anchor like "c").
 */
export function registerTransformActions(
  actions: ActionService,
  service: TransformService,
  tool: TransformTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  files: FilesService,
  dialogs: DialogService,
  destroyRef?: DestroyRef,
): void {
  const toggle = (m: TransformMode) => ({
    run: () => {
      if (!service.canRun() && tool.mode() !== m) {
        files.notice.set(T.needSelection);
        return false;
      }
      freehand.toggle(false);
      tools.stopAll('transform');
      tool.toggle(m);
      return true;
    },
    enabled: () => service.canRun() || tool.mode() === m,
    checked: () => tool.mode() === m,
  });
  actions.registerAll(
    {
      'transform.rotate': toggle('rotate'),
      'transform.scale': toggle('scale'),
      'transform.reflect': toggle('reflect'),
      'transform.dialog': {
        run: () => {
          tools.stopAll();
          dialogs.show('transform');
          return true;
        },
        enabled: () => service.canRun(),
      },
      'transform.apply': {
        run: (args) => {
          const a = (args ?? {}) as Record<string, unknown>;
          const p = a['pivot'];
          const pivot: Pivot =
            Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number')
              ? { x: p[0] as number, y: p[1] as number }
              : ANCHORS.includes(p as Anchor)
                ? (p as Anchor)
                : 'c';
          const reflect = (['none', 'horizontal', 'vertical'] as const).find(
            (r) => r === a['reflect'],
          );
          return service.apply({
            spec: {
              ...IDENTITY_SPEC,
              dx: num(a, 'dx', 0),
              dy: num(a, 'dy', 0),
              rotate: num(a, 'rotate', 0),
              sx: num(a, 'sx', 1),
              sy: num(a, 'sy', 1),
              reflect: (reflect ?? 'none') as Reflect,
            },
            pivot,
            each: a['each'] === true,
            copy: a['copy'] === true,
          });
        },
        enabled: () => service.canRun(),
      },
    },
    destroyRef,
  );
}
