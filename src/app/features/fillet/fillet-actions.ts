import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CornerKind } from '../../shared/geometry/pathops/fillet';
import { CanvasTools } from '../canvas/canvas-tools';
import { FreehandStore } from '../tools/freehand.store';
import { FilletService } from './fillet.service';
import { FilletTool } from './fillet-tool';

const point = (a: unknown) => {
  const r = a as { x?: unknown; y?: unknown } | undefined;
  return typeof r?.x === 'number' && typeof r?.y === 'number' ? { x: r.x, y: r.y } : null;
};

/**
 * The actions of prompt 051: `fillet.tool` / `chamfer.tool` on/off; `fillet.at { kind, a, b?,
 * radius }` – `a` / `b` points on the two sides (on the parts that stay), without `b` the corner
 * of one path at `a` – at once (the AI's way).
 */
export function registerFilletActions(
  actions: ActionService,
  service: FilletService,
  tool: FilletTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const toggle = (k: CornerKind) => ({
    run: () => {
      freehand.toggle(false);
      tools.stopAll('fillet');
      tool.toggle(k);
    },
    checked: () => tool.mode() === k,
  });
  actions.registerAll(
    {
      'fillet.tool': toggle('fillet'),
      'chamfer.tool': toggle('chamfer'),
      'fillet.at': {
        run: async (args) => {
          const a = args as Record<string, unknown> | undefined;
          const pa = point(a?.['a']);
          const pb = point(a?.['b']);
          const r = a?.['radius'];
          if (!pa || typeof r !== 'number') return false;
          await service.ready();
          const sa = tool.near(pa)[0];
          const sb = pb ? tool.near(pb)[0] : null;
          if (!sa || (pb && !sb)) return false;
          const kind = a?.['kind'] === 'chamfer' ? 'chamfer' : 'fillet';
          const err = service.apply(
            { kind, a: { shape: sa.shape, p: pa }, b: sb ? { shape: sb.shape, p: pb! } : null },
            r,
          );
          return err === null;
        },
      },
    },
    destroyRef,
  );
}
