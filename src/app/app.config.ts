import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { BACKEND_PROVIDERS } from './backend-providers';
import { SettingsStore } from './features/settings/settings.store';
import { SettingsSync } from './features/settings/settings-sync';
import { ColorSwatches } from './shared/controls/color-swatches';
import { ColorLibrary } from './features/color/color-library';

/**
 * Zoneless (Angular 22 default, no zone.js). The backend facades come from
 * `backend-providers.ts` (dev build: `backend-providers.dev.ts`, design 003 E14); tests replace
 * them with the fakes from `src/testing/`. The settings are loaded before the first render
 * (design 015 E5) and bound to the stores of the window.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ...BACKEND_PROVIDERS,
    // the swatches of the colour popover come from the document and the settings (prompt 074)
    { provide: ColorSwatches, useExisting: ColorLibrary },
    provideAppInitializer(async () => {
      const settings = inject(SettingsStore);
      const sync = inject(SettingsSync);
      await settings.load();
      sync.start();
    }),
  ],
};
