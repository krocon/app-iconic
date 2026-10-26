import { Provider } from '@angular/core';
import { AboutApi } from '../app/core/about/about-api';
import { IconFileApi } from '../app/core/icon-file/icon-file-api';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { KeymapApi, MenuApi } from '../app/core/menu/menu-api';
import { WindowApi } from '../app/core/window/window-api';
import { FakeKeymapApi, FakeMenuApi } from './fake-menu-api';
import { FakeAboutApi } from './fake-about-api';
import { FakeIconFileApi } from './fake-icon-file-api';
import { FakeRecentFilesApi } from './fake-recent-files-api';
import { FakeWindowApi } from './fake-window-api';

/** Every backend facade replaced by its fake (unit tests). */
export function fakeBackend(): {
  providers: Provider[];
  files: FakeIconFileApi;
  window: FakeWindowApi;
  recent: FakeRecentFilesApi;
  menu: FakeMenuApi;
  keymap: FakeKeymapApi;
} {
  const files = new FakeIconFileApi();
  const window = new FakeWindowApi();
  const recent = new FakeRecentFilesApi();
  const menu = new FakeMenuApi();
  const keymap = new FakeKeymapApi();
  return {
    files,
    window,
    recent,
    menu,
    keymap,
    providers: [
      { provide: AboutApi, useClass: FakeAboutApi },
      { provide: IconFileApi, useValue: files },
      { provide: WindowApi, useValue: window },
      { provide: RecentFilesApi, useValue: recent },
      { provide: MenuApi, useValue: menu },
      { provide: KeymapApi, useValue: keymap },
    ],
  };
}
