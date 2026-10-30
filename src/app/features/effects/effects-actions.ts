import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { Effect, EFFECT_KINDS, EffectKind } from './effect-model';
import { EffectsService } from './effects.service';

const kindOf = (a: unknown): EffectKind | null => {
  const k = (a as { kind?: unknown } | undefined)?.kind;
  return EFFECT_KINDS.includes(k as EffectKind) ? (k as EffectKind) : null;
};

/**
 * The actions of prompt 076: `effect.add { kind, node? }`, `effect.set { kind, on?, color?,
 * opacity?, dx?, dy?, radius?, node? }`, `effect.remove { kind, node? }`; `mask.create` (the
 * front-most selected element masks the others), `mask.release { node? }`, `mask.type { type,
 * node? }`. Each one undo step.
 */
export function registerEffectsActions(
  actions: ActionService,
  fx: EffectsService,
  destroyRef?: DestroyRef,
): void {
  const one = () => fx.target() !== null && fx.state()?.kind !== 'foreign';
  actions.registerAll(
    {
      'effect.add': {
        run: (a) => {
          const k = kindOf(a);
          return k ? fx.change(k, {}, (a as { node?: unknown }).node) : false;
        },
        enabled: one,
      },
      'effect.set': {
        run: (a) => {
          const k = kindOf(a);
          if (!k) return false;
          const { kind: _k, node, ...patch } = a as Record<string, unknown>;
          void _k;
          return fx.change(k, patch as Partial<Effect>, node);
        },
        enabled: one,
      },
      'effect.remove': {
        run: (a) => {
          const k = kindOf(a);
          return k ? fx.change(k, null, (a as { node?: unknown }).node) : false;
        },
        enabled: () => fx.effects().length > 0,
      },
      'mask.create': { run: () => fx.createMask(), enabled: () => fx.canCreateMask() },
      'mask.release': {
        run: (a) => fx.releaseMask((a as { node?: unknown } | undefined)?.node),
        enabled: () => fx.maskType() !== null,
      },
      'mask.type': {
        run: (a) => {
          const t = (a as { type?: unknown } | undefined)?.type;
          return t === 'alpha' || t === 'luminance'
            ? fx.setMaskType(t, (a as { node?: unknown }).node)
            : false;
        },
        enabled: () => fx.maskType() !== null,
      },
    },
    destroyRef,
  );
}
