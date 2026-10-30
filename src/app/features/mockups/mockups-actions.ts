import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { SCENE_SCALES, SceneScale } from './mockup-scenes';
import { MockupsService } from './mockups.service';

type Args = { scene?: unknown; scale?: unknown; appearance?: unknown } | undefined;

/**
 * The actions of "In Context" (prompt 081): `view.mockups` (the popover), `mockups.appearance
 * { scene, appearance }`, `mockups.scale { scale }`, `mockups.copyPng` / `mockups.savePng
 * { scene?, scale? }`, `mockups.background` (open dialog), `mockups.clearBackground`.
 */
export function registerMockupsActions(
  actions: ActionService,
  service: MockupsService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'view.mockups': { run: () => service.toggle(), checked: () => service.visible() },
      'mockups.appearance': {
        run: (a) => service.setAppearance((a as Args)?.scene, (a as Args)?.appearance),
      },
      'mockups.scale': {
        run: (a) => {
          const s = (a as Args)?.scale as SceneScale;
          if (!SCENE_SCALES.includes(s)) return false;
          service.scale.set(s);
          return true;
        },
      },
      'mockups.copyPng': { run: (a) => service.copyPng((a as Args) ?? {}) },
      'mockups.savePng': { run: (a) => service.savePng((a as Args) ?? {}) },
      'mockups.background': { run: () => service.pickBackground() },
      'mockups.clearBackground': {
        run: () => service.clearBackground(),
        enabled: () => service.background() !== null,
      },
    },
    destroyRef,
  );
}
