import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { TrimMode, TrimTool } from './trim-tool';

const point = (a: unknown) => {
  const r = a as { x?: unknown; y?: unknown } | undefined;
  return typeof r?.x === 'number' && typeof r?.y === 'number' ? { x: r.x, y: r.y } : null;
};

/**
 * The actions of prompt 050: `trim.tool` (T) and `extend.tool` (E) switch the tools on/off;
 * `trim.at` / `extend.at { x, y }` cut / lengthen at a document point at once (the AI's way).
 */
export function registerTrimActions(
  actions: ActionService,
  tool: TrimTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const toggle = (m: TrimMode) => ({
    run: () => {
      freehand.toggle(false);
      tools.stopAll('trim');
      tool.toggle(m);
    },
    checked: () => tool.mode() === m,
  });
  actions.registerAll(
    {
      'trim.tool': toggle('trim'),
      'extend.tool': toggle('extend'),
      'trim.at': {
        run: async (a) => {
          const p = point(a);
          if (!p) return false;
          await tool.ready();
          return tool.trimAt(p);
        },
      },
      'extend.at': {
        run: async (a) => {
          const p = point(a);
          if (!p) return false;
          await tool.ready();
          return tool.extend(p);
        },
      },
    },
    destroyRef,
  );
}
