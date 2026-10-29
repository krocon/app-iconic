import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { ALIGN_MODES, DistributeAxis, DistributeKind } from '../../shared/geometry/align';
import { ALIGN_TO, AlignTo } from '../hierarchy/align';
import { AlignService } from './align.service';

export const DISTRIBUTE: readonly { id: string; axis: DistributeAxis; kind: DistributeKind }[] = [
  { id: 'arrange.distribute.horizontalCenters', axis: 'horizontal', kind: 'centers' },
  { id: 'arrange.distribute.verticalCenters', axis: 'vertical', kind: 'centers' },
  { id: 'arrange.distribute.horizontalGaps', axis: 'horizontal', kind: 'gaps' },
  { id: 'arrange.distribute.verticalGaps', axis: 'vertical', kind: 'gaps' },
];

/**
 * The actions of align and distribute (design 006 E13, prompt 054): `arrange.align.<mode> { to? }`,
 * `arrange.alignTo.<selection|canvas|key>` (choice, checked), `arrange.distribute.*`,
 * `arrange.distribute.spacing { axis, gap }` (a fixed gap).
 */
export function registerAlignActions(
  actions: ActionService,
  align: AlignService,
  destroyRef?: DestroyRef,
): void {
  const toOf = (a: unknown): AlignTo | undefined => {
    const v = (a as { to?: unknown } | undefined)?.to;
    return ALIGN_TO.includes(v as AlignTo) ? (v as AlignTo) : undefined;
  };
  const handlers: Record<string, ActionHandler> = {};
  for (const m of ALIGN_MODES) {
    handlers[`arrange.align.${m}`] = {
      run: (a) => align.align(m, toOf(a)),
      enabled: () => align.canAlign(),
    };
  }
  for (const to of ALIGN_TO) {
    handlers[`arrange.alignTo.${to}`] = {
      run: () => align.to.set(to),
      checked: () => align.to() === to,
    };
  }
  for (const d of DISTRIBUTE) {
    handlers[d.id] = {
      run: () => align.distribute(d.axis, d.kind),
      enabled: () => align.canDistribute(),
    };
  }
  handlers['arrange.distribute.spacing'] = {
    run: (a) => {
      const args = (a ?? {}) as { axis?: unknown; gap?: unknown };
      const gap = typeof args.gap === 'number' ? args.gap : align.gap();
      const axis: DistributeAxis = args.axis === 'vertical' ? 'vertical' : 'horizontal';
      align.gap.set(gap);
      return align.distribute(axis, 'gaps', gap);
    },
    enabled: () => align.canDistribute(0),
  };
  actions.registerAll(handlers, destroyRef);
}
