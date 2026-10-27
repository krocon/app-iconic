import { DestroyRef } from '@angular/core';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { AppearanceKey } from '../document/model/specializations';
import { IconInspectorService, TargetArgs } from './icon-inspector.service';
import { SquaresChoice } from './platforms';

/**
 * Actions of the icon inspector (design 010 E14, AI rule): what the inspector changes, the AI
 * changes with the same commands – `icon.setFill`, `icon.set`, `icon.removeVariant`,
 * `icon.renameGroup`, `icon.renameLayer`, `icon.renameAsset`, `icon.setPlatforms`,
 * `icon.setColorSpace`, `icon.editAppearance`, `icon.copyJson`. Each change is one undo step.
 */
export function registerIconActions(
  actions: ActionService,
  icon: IconInspectorService,
  destroyRef?: DestroyRef,
): void {
  const hasDoc = () => icon.store !== null;
  type FieldArgs = TargetArgs & { field: string; value?: unknown; appearance?: AppearanceKey };
  const handlers: Record<string, ActionHandler> = {
    'icon.setFill': {
      run: (args) => {
        const a = args as { fill: unknown; appearance?: AppearanceKey };
        icon.set({ kind: 'root' }, 'background', a.fill, a.appearance);
      },
      enabled: hasDoc,
    },
    'icon.set': {
      run: (args) => {
        const a = args as FieldArgs;
        icon.set(icon.resolveTarget(a), a.field, a.value, a.appearance);
      },
      enabled: hasDoc,
    },
    'icon.removeVariant': {
      run: (args) => {
        const a = args as FieldArgs;
        icon.removeVariant(icon.resolveTarget(a), a.field, a.appearance);
      },
      enabled: hasDoc,
    },
    'icon.renameGroup': {
      run: (args) => {
        const a = args as { group: number; name: string };
        icon.renameGroup(a.group, a.name);
      },
      enabled: hasDoc,
    },
    'icon.renameLayer': {
      run: (args) => {
        const a = args as { group: number; layer: number; name: string };
        icon.renameLayer(a.group, a.layer, a.name);
      },
      enabled: hasDoc,
    },
    'icon.renameAsset': {
      run: (args) => {
        const a = args as { from: string; to: string };
        icon.renameAsset(a.from, a.to);
      },
      enabled: hasDoc,
    },
    'icon.setPlatforms': {
      run: (args) =>
        icon.setPlatforms(args as { squares?: Exclude<SquaresChoice, 'other'>; watchOS?: boolean }),
      enabled: hasDoc,
    },
    'icon.setColorSpace': {
      run: (args) => {
        const s = (args as { space: string }).space;
        icon.setColorSpace(s === 'none' ? null : s);
      },
      enabled: hasDoc,
    },
    'icon.editAppearance': {
      run: (args) => icon.setAppearance((args as { appearance: AppearanceKey }).appearance),
    },
    'icon.copyJson': { run: () => icon.copyJson(), enabled: hasDoc },
  };
  for (const [id, h] of Object.entries(handlers)) actions.register(id, h, destroyRef);
}
