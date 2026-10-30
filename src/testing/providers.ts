import { Provider } from '@angular/core';
import { AboutApi } from '../app/core/about/about-api';
import { IconFileApi } from '../app/core/icon-file/icon-file-api';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { KeymapApi, MenuApi } from '../app/core/menu/menu-api';
import { WindowApi } from '../app/core/window/window-api';
import { ExportApi } from '../app/core/export/export-api';
import { FakeExportApi } from './fake-export-api';
import { FontApi } from '../app/core/fonts/font-api';
import { FakeFontApi } from './fake-font-api';
import { FakeKeymapApi, FakeMenuApi } from './fake-menu-api';
import { FakeAboutApi } from './fake-about-api';
import { FakeIconFileApi } from './fake-icon-file-api';
import { FakeRecentFilesApi } from './fake-recent-files-api';
import { FakeWindowApi } from './fake-window-api';
import { SettingsApi } from '../app/core/settings/settings-api';
import { FakeSettingsApi } from './fake-settings-api';
import { McpApi } from '../app/core/mcp/mcp-api';
import { FakeMcpApi } from './fake-mcp-api';
import { DropApi } from '../app/core/drop/drop-api';
import { FakeDropApi } from './fake-drop-api';
import { RecoveryApi } from '../app/core/recovery/recovery-api';
import { FakeRecoveryApi } from './fake-recovery-api';
import { SymbolLibraryApi } from '../app/core/symbols/symbol-library-api';
import { FakeSymbolLibraryApi } from './fake-symbol-library-api';

/** Every backend facade replaced by its fake (unit tests). */
export function fakeBackend(): {
  providers: Provider[];
  files: FakeIconFileApi;
  window: FakeWindowApi;
  recent: FakeRecentFilesApi;
  menu: FakeMenuApi;
  keymap: FakeKeymapApi;
  exporter: FakeExportApi;
  fonts: FakeFontApi;
  settings: FakeSettingsApi;
  mcp: FakeMcpApi;
  drop: FakeDropApi;
  recovery: FakeRecoveryApi;
  symbols: FakeSymbolLibraryApi;
} {
  const files = new FakeIconFileApi();
  const window = new FakeWindowApi();
  const recent = new FakeRecentFilesApi();
  const menu = new FakeMenuApi();
  const keymap = new FakeKeymapApi();
  const exporter = new FakeExportApi();
  const fonts = new FakeFontApi();
  const settings = new FakeSettingsApi();
  const mcp = new FakeMcpApi();
  const drop = new FakeDropApi();
  const recovery = new FakeRecoveryApi(files);
  const symbols = new FakeSymbolLibraryApi();
  return {
    files,
    window,
    recent,
    menu,
    keymap,
    exporter,
    fonts,
    settings,
    mcp,
    drop,
    recovery,
    symbols,
    providers: [
      { provide: AboutApi, useClass: FakeAboutApi },
      { provide: IconFileApi, useValue: files },
      { provide: WindowApi, useValue: window },
      { provide: RecentFilesApi, useValue: recent },
      { provide: MenuApi, useValue: menu },
      { provide: KeymapApi, useValue: keymap },
      { provide: ExportApi, useValue: exporter },
      { provide: FontApi, useValue: fonts },
      { provide: SettingsApi, useValue: settings },
      { provide: McpApi, useValue: mcp },
      { provide: DropApi, useValue: drop },
      { provide: RecoveryApi, useValue: recovery },
      { provide: SymbolLibraryApi, useValue: symbols },
    ],
  };
}
