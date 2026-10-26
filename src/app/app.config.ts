import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BACKEND_PROVIDERS } from './backend-providers';

/**
 * Zoneless (Angular 22 default, no zone.js). The backend facades come from
 * `backend-providers.ts` (dev build: `backend-providers.dev.ts`, design 003 E14); tests replace
 * them with the fakes from `src/testing/`.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), ...BACKEND_PROVIDERS],
};
