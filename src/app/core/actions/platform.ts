// Übernommen aus editlicious src/app/core/actions/platform.ts (Prompt 005).
import { InjectionToken } from '@angular/core';

/** The keyboard world (editlicious, comic-commander design 008 E6; design 005 E2): macOS (⌘) or everything else (Ctrl). */
export type Os = 'mac' | 'other';

export function detectOs(nav: Navigator | undefined = globalThis.navigator): Os {
  const p =
    (nav as (Navigator & { userAgentData?: { platform?: string } }) | undefined)?.userAgentData
      ?.platform ??
    nav?.platform ??
    '';
  return /^mac/i.test(p) ? 'mac' : 'other';
}

/** Tests choose the OS. */
export const OS = new InjectionToken<Os>('OS', { factory: () => detectOs() });
