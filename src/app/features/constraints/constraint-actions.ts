import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CONSTRAINT_TYPES, ConstraintType } from '../../shared/geometry/constraints/constraints';
import { CanvasTools } from '../canvas/canvas-tools';
import { NodeRef } from '../document/icon-document';
import { FreehandStore } from '../tools/freehand.store';
import { ConstraintService, EntityPick } from './constraint.service';
import { ConstraintTool } from './constraint-tool';
import { CONSTRAINT_TEXTS as T } from './constraint-texts';

const isRef = (v: unknown): v is NodeRef =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as NodeRef).asset === 'string' &&
  typeof (v as NodeRef).id === 'string';

/** `[{ node: { asset, id }, part }]` from the AI, checked. */
export function picksFrom(v: unknown): EntityPick[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 3) return null;
  const out: EntityPick[] = [];
  for (const p of v) {
    const o = p as { node?: unknown; part?: unknown };
    if (!isRef(o?.node) || typeof o.part !== 'string' || !/^[a-z0-9]{1,12}$/.test(o.part)) {
      return null;
    }
    out.push({ node: { asset: o.node.asset, id: o.node.id }, part: o.part });
  }
  return out;
}

/**
 * The actions of prompt 059: `constraint.tool { type? }` (K), `constraint.add { type, refs, value? }`
 * (refs: `[{ node, part }]`, parts `p1 p2 line` of a line, `tl tr br bl center top right bottom
 * left` of a rect, `center circle` of a circle, `p0… e0…` of a polygon), `constraint.remove
 * { asset?, id? }`, `constraint.setValue { asset, id, value }`, `constraint.solve { asset? }` and
 * `view.constraints` (badges and dimensions shown).
 */
export function registerConstraintActions(
  actions: ActionService,
  service: ConstraintService,
  tool: ConstraintTool,
  tools: CanvasTools,
  freehand: FreehandStore,
  destroyRef?: DestroyRef,
): void {
  const typeOf = (a: unknown): ConstraintType | undefined => {
    const t = (a as { type?: unknown } | undefined)?.type;
    return CONSTRAINT_TYPES.includes(t as ConstraintType) ? (t as ConstraintType) : undefined;
  };
  actions.registerAll(
    {
      'constraint.tool': {
        run: (a) => {
          const type = typeOf(a);
          freehand.toggle(false);
          tools.stopAll('constraint');
          tool.start(type, !type);
        },
        checked: () => tool.on(),
      },
      'constraint.add': {
        run: (a) => {
          const type = typeOf(a);
          const picks = picksFrom((a as { refs?: unknown } | undefined)?.refs);
          const value = (a as { value?: unknown } | undefined)?.value;
          if (!type || !picks) return false;
          const r = service.add(type, picks, typeof value === 'number' ? value : undefined);
          tool.message.set(r === true ? null : T.errors[r]);
          return r === true;
        },
      },
      'constraint.remove': {
        run: (a) => {
          const o = (a ?? {}) as { asset?: unknown; id?: unknown };
          const sel = tool.selected();
          const asset = typeof o.asset === 'string' ? o.asset : sel?.asset;
          const id = typeof o.id === 'string' ? o.id : sel?.id;
          if (!asset || !id) return false;
          if (sel?.asset === asset && sel.id === id) tool.selected.set(null);
          return service.remove(asset, id);
        },
        enabled: (a) => !!tool.selected() || !!(a as { id?: unknown } | undefined)?.id,
      },
      'constraint.setValue': {
        run: (a) => {
          const o = (a ?? {}) as { asset?: unknown; id?: unknown; value?: unknown };
          if (typeof o.asset !== 'string' || typeof o.id !== 'string') return false;
          if (typeof o.value !== 'number') return false;
          const r = service.setValue(o.asset, o.id, o.value);
          tool.message.set(r === true ? null : T.errors[r]);
          return r === true;
        },
      },
      'constraint.solve': {
        run: (a) => {
          const asset = (a as { asset?: unknown } | undefined)?.asset;
          const list = typeof asset === 'string' ? [asset] : service.assets();
          let ok = true;
          for (const name of list) {
            const r = service.solveAsset(name);
            if (r !== true) {
              ok = false;
              tool.message.set(T.errors[r]);
            }
          }
          return ok;
        },
        enabled: () => service.assets().length > 0,
      },
      'view.constraints': {
        run: () => tool.visible.update((v) => !v),
        checked: () => tool.visible(),
      },
    },
    destroyRef,
  );
}
