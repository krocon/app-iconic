import { EnvironmentProviders, Provider } from '@angular/core';
import { AboutApi, TauriAboutApi } from './core/about/about-api';
import { IconFileApi, TauriIconFileApi } from './core/icon-file/icon-file-api';
import { RecentFilesApi, TauriRecentFilesApi } from './core/recent/recent-files-api';
import { KeymapApi, MenuApi, TauriKeymapApi, TauriMenuApi } from './core/menu/menu-api';
import { TauriWindowApi, WindowApi } from './core/window/window-api';
import { ExportApi, TauriExportApi } from './core/export/export-api';

/**
 * The backend facades of the app (production build). The development build (`ng serve`, also
 * under `tauri dev`) replaces this file by `backend-providers.dev.ts` (design 003 E14).
 */
export const BACKEND_PROVIDERS: (Provider | EnvironmentProviders)[] = [
  { provide: AboutApi, useClass: TauriAboutApi },
  { provide: IconFileApi, useClass: TauriIconFileApi },
  { provide: RecentFilesApi, useClass: TauriRecentFilesApi },
  { provide: WindowApi, useClass: TauriWindowApi },
  { provide: MenuApi, useClass: TauriMenuApi },
  { provide: KeymapApi, useClass: TauriKeymapApi },
  { provide: ExportApi, useClass: TauriExportApi },
];
