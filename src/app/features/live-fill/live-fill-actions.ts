import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTools } from '../canvas/canvas-tools';
import { FilesService } from '../files/files.service';
import { FreehandStore } from '../tools/freehand.store';
import { LIVE_FILL_ATTR } from './live-fill-model';
import { LiveFillService } from './live-fill.service';
import { LiveFillTool } from './live-fill-tool';

const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%/]{5,60}\))$/;

const pointOf = (v: unknown): Point | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && isFinite(n))
    ? { x: v[0] as number, y: v[1] as number }
    : null;

/**
 * The actions of prompt 060: `fill.tool` (F), `fill.at { x, y, color? }`, `fill.across { points,
 * color? }` (several areas as one fill), `fill.remove { x, y }`, `fill.color { color }` and
 * `fill.detach` (the selected fills become plain paths). Points in document units.
 */
export function registerLiveFillActions(
  actions: ActionService,
  service: LiveFillService,
  tool: LiveFillTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  const colorOf = (a: unknown) => {
    const c = (a as { color?: unknown } | undefined)?.color;
    return typeof c === 'string' && COLOR.test(c.trim()) ? c.trim() : null;
  };
  const xy = (a: unknown) => {
    const o = (a ?? {}) as { x?: unknown; y?: unknown };
    return typeof o.x === 'number' && typeof o.y === 'number' ? { x: o.x, y: o.y } : null;
  };
  actions.registerAll(
    {
      'fill.tool': {
        run: () => {
          freehand.toggle(false);
          tools.stopAll('fill');
          tool.toggle();
        },
        checked: () => tool.on(),
      },
      'fill.color': {
        run: (a) => {
          const c = colorOf(a);
          if (!c) return false;
          tool.color.set(c);
          return true;
        },
      },
      'fill.at': {
        run: async (a) => {
          const p = xy(a);
          if (!p) return false;
          await service.ready();
          return service.fill([p], colorOf(a) ?? tool.color());
        },
      },
      'fill.across': {
        run: async (a) => {
          const raw = (a as { points?: unknown } | undefined)?.points;
          const pts = Array.isArray(raw) ? raw.slice(0, 64).map(pointOf) : [];
          if (!pts.length || pts.some((p) => !p)) return false;
          await service.ready();
          return service.fill(pts as Point[], colorOf(a) ?? tool.color());
        },
      },
      'fill.remove': {
        run: async (a) => {
          const p = xy(a);
          if (!p) return false;
          await service.ready();
          return service.remove(p);
        },
      },
      'fill.detach': {
        run: () => service.detach(files.store()?.selection() ?? []),
        enabled: () => {
          const store = files.store();
          const doc = store?.document();
          return !!store?.selection().some((r) => doc?.node(r)?.hasAttribute(LIVE_FILL_ATTR));
        },
      },
    },
    destroyRef,
  );
}
