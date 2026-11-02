import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { TEMPLATE_TEXTS as T } from './template-texts';
import { TemplateService } from './template.service';

/** Opacity steps of the menu item (without arguments it moves to the next). */
export const OPACITY_STEPS = [0.25, 0.5, 0.75, 1] as const;

/** The next step after `v` (wrapping round). */
export function nextOpacity(v: number): number {
  return OPACITY_STEPS.find((s) => s > v + 1e-6) ?? OPACITY_STEPS[0];
}

/**
 * The canvas template (prompt 087 E12): set it from a file, the clipboard or the selected PNG
 * layer, show/hide, opacity, remove. Files and the clipboard are not for the AI (018) – it uses
 * the tool `set_template` with a path.
 */
export function registerTemplateActions(
  actions: ActionService,
  template: TemplateService,
  destroyRef?: DestroyRef,
): void {
  const store = template.store;
  const has = () => store.image() !== null;
  actions.registerAll(
    {
      'template.fromFile': { run: () => template.fromFile() },
      'template.fromClipboard': { run: () => template.fromClipboard() },
      'template.fromLayer': {
        run: () => template.fromLayer(),
        enabled: () => template.canFromLayer(),
      },
      'template.toggle': {
        run: () => store.toggle(),
        enabled: has,
        checked: () => store.shown(),
      },
      'template.opacity': {
        run: (args) =>
          store.setOpacity(
            (args as { value?: number } | undefined)?.value ?? nextOpacity(store.opacity()),
          ),
        enabled: has,
        label: () => T.opacity(Math.round(store.opacity() * 100)),
      },
      'template.clear': { run: () => store.clear(), enabled: has },
    },
    destroyRef,
  );
}
