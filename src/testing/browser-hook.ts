import { inject } from '@angular/core';
import { IconFileApi } from '../app/core/icon-file/icon-file-api';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { WindowApi } from '../app/core/window/window-api';
import { SetAttribute } from '../app/features/document/commands';
import { DocumentStore } from '../app/features/document/document.store';
import { serializeAsset } from '../app/features/document/svg/node-ids';
import { FilesService } from '../app/features/files/files.service';
import { FakeIconFileApi } from './fake-icon-file-api';
import { FakeRecentFilesApi } from './fake-recent-files-api';
import { FakeWindowApi } from './fake-window-api';

/**
 * `window.__appIconic` – the test hook of the browser mode (design 003 E14): Playwright reaches
 * the fakes and runs document commands through it ("change an attribute over a test hook",
 * prompt 003). Installed only by `backend-providers.dev.ts` outside Tauri.
 */
export interface AppIconicHook {
  files: FakeIconFileApi;
  window: FakeWindowApi;
  recent: FakeRecentFilesApi;
  store(): DocumentStore | null;
  /** `data-ai-id` of the root element of an asset. */
  rootId(asset: string): string | null;
  /** Runs `SetAttribute` on the node `id` of `asset` through the store (undoable). */
  setAttribute(asset: string, id: string, name: string, value: string): void;
  /** The asset as it would be saved now. */
  assetText(asset: string): string | null;
  /** The text of an asset in a "saved file" of the fake. */
  fileAsset(path: string, asset: string): string | null;
  /** An SVG file the next "Import SVG…" can pick. */
  addSvgFile(path: string, name: string, text: string): void;
  /** Answers of the next file dialogs. */
  pick(...paths: (string | null)[]): void;
  /** Plays the window's close button. */
  requestClose(): void;
}

declare global {
  interface Window {
    __appIconic?: AppIconicHook;
  }
}

export function installTestHook(): void {
  const files = inject(IconFileApi) as FakeIconFileApi;
  const win = inject(WindowApi) as FakeWindowApi;
  const recent = inject(RecentFilesApi) as FakeRecentFilesApi;
  const service = inject(FilesService);
  const store = () => service.store();
  const svgOf = (asset: string) => store()?.document().assets.get(asset)?.svg ?? null;
  window.__appIconic = {
    files,
    window: win,
    recent,
    store,
    rootId: (asset) => svgOf(asset)?.doc.documentElement.getAttribute('data-ai-id') ?? null,
    setAttribute: (asset, id, name, value) =>
      store()?.execute(new SetAttribute({ asset, id }, name, value)),
    assetText: (asset) => {
      const svg = svgOf(asset);
      return svg ? serializeAsset(svg) : null;
    },
    fileAsset: (path, asset) =>
      files.files.get(path)?.assets.find((a) => a.name === asset)?.text ?? null,
    addSvgFile: (path, name, text) => {
      files.svgFiles.set(path, { name, text });
      files.picks.push(path);
    },
    pick: (...paths) => files.picks.push(...paths),
    requestClose: () => win.requestClose(),
  };
}
