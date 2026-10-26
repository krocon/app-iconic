import { EnvironmentProviders, provideAppInitializer, Provider } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { AboutApi, TauriAboutApi } from './core/about/about-api';
import { IconFileApi, TauriIconFileApi } from './core/icon-file/icon-file-api';
import { RecentFilesApi, TauriRecentFilesApi } from './core/recent/recent-files-api';
import { KeymapApi, MenuApi, TauriKeymapApi, TauriMenuApi } from './core/menu/menu-api';
import { TauriWindowApi, WindowApi } from './core/window/window-api';
import { FakeKeymapApi, FakeMenuApi } from '../testing/fake-menu-api';
import { FakeIconFileApi } from '../testing/fake-icon-file-api';
import { FakeRecentFilesApi } from '../testing/fake-recent-files-api';
import { FakeWindowApi } from '../testing/fake-window-api';
import { installTestHook } from '../testing/browser-hook';
import { SVG_FIXTURES } from '../testing/fixtures/svg-fixtures';

/**
 * DEVELOPMENT ONLY (design 003 E14) – replaces `backend-providers.ts` via `fileReplacements` in
 * the `development` configuration. Under Tauri (`tauri dev`) the real facades; in a plain
 * browser (`pnpm start`, Playwright) the fakes from `src/testing/` with `camscanner.icon` in
 * memory (plus every SVG fixture as `/fixtures/svg/<name>.icon`) and the test hook
 * `window.__appIconic`. Never part of the production build.
 */
function browserFiles(): IconFileApi {
  const fake = new FakeIconFileApi();
  // every SVG fixture as a one-layer document (design 004 E16)
  for (const f of SVG_FIXTURES) {
    fake.addSvgIcon(`/fixtures/svg/${f.name.replace(/\.svg$/, '')}.icon`, f.name, f.text);
  }
  fake.fallbackPick = (kind, name) =>
    kind === 'open' ? FakeIconFileApi.CAMSCANNER : kind === 'save' ? `/browser/${name}` : null;
  return fake;
}

function browserWindow(): WindowApi {
  const fake = new FakeWindowApi();
  fake.setDocumentTitle = true;
  return fake;
}

export const BACKEND_PROVIDERS: (Provider | EnvironmentProviders)[] = isTauri()
  ? [
      { provide: AboutApi, useClass: TauriAboutApi },
      { provide: IconFileApi, useClass: TauriIconFileApi },
      { provide: RecentFilesApi, useClass: TauriRecentFilesApi },
      { provide: WindowApi, useClass: TauriWindowApi },
      { provide: MenuApi, useClass: TauriMenuApi },
      { provide: KeymapApi, useClass: TauriKeymapApi },
    ]
  : [
      // About keeps the real facade: it shows "desktop backend not available" (e2e/shell)
      { provide: AboutApi, useClass: TauriAboutApi },
      { provide: IconFileApi, useFactory: browserFiles },
      { provide: RecentFilesApi, useClass: FakeRecentFilesApi },
      { provide: WindowApi, useFactory: browserWindow },
      { provide: MenuApi, useClass: FakeMenuApi },
      { provide: KeymapApi, useClass: FakeKeymapApi },
      provideAppInitializer(installTestHook),
    ];
