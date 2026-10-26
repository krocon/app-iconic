import { inject } from '@angular/core';
import { IconFileApi } from '../app/core/icon-file/icon-file-api';
import { RecentFilesApi } from '../app/core/recent/recent-files-api';
import { WindowApi } from '../app/core/window/window-api';
import { ActionInfo, ActionService } from '../app/core/actions/action.service';
import { MenuSpec } from '../app/core/menu/menu.models';
import { CommandJson, SetAttribute } from '../app/features/document/commands';
import { MenuService } from '../app/features/menus/menu.service';
import { DocumentStore } from '../app/features/document/document.store';
import { serializeAsset } from '../app/features/document/svg/node-ids';
import { FilesService } from '../app/features/files/files.service';
import { CanvasViewStore } from '../app/features/canvas/canvas-view.store';
import {
  clientToDocument,
  documentToClient,
  nodeBoundsInDocument,
  nodeToDocument,
  Rect,
} from '../app/shared/geometry/dom-geometry';
import { Point } from '../app/shared/geometry/view-transform';
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
  /** The canvas view state (zoom, pan, options – design 004 E16). */
  canvas: CanvasViewStore;
  /** `clientToDocument` / `documentToClient` with the real canvas host. */
  clientToDocument(clientX: number, clientY: number): Point | null;
  documentToClient(x: number, y: number): { clientX: number; clientY: number } | null;
  /** `nodeToDocument` of the node `id` of `asset` as `[a, b, c, d, e, f]`. */
  nodeToDocument(asset: string, id: string): number[] | null;
  nodeBounds(asset: string, id: string): Rect | null;
  /** Runs an action like menu, keyboard or the AI (design 005 E18); `true` = it ran. */
  run(id: string, args?: unknown): boolean;
  /** Every action with its state (`ActionService.describe`). */
  actions(): ActionInfo[];
  /** Runs a serialised document command; the error text if it was refused. */
  runCommand(json: unknown): string | null;
  /** The last undoable step as JSON. */
  lastCommand(): CommandJson | null;
  /** The spec the native menu would get. */
  menuSpec(): MenuSpec;
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
  const canvas = inject(CanvasViewStore);
  const actions = inject(ActionService);
  const menus = inject(MenuService);
  const node = (asset: string, id: string) =>
    (store()?.document().node({ asset, id }) as SVGGraphicsElement | null) ?? null;
  window.__appIconic = {
    files,
    window: win,
    recent,
    store,
    rootId: (asset) => svgOf(asset)?.root.getAttribute('data-ai-id') ?? null,
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
    canvas,
    clientToDocument: (clientX, clientY) =>
      canvas.host ? clientToDocument(canvas.host, { clientX, clientY }) : null,
    documentToClient: (x, y) => (canvas.host ? documentToClient(canvas.host, { x, y }) : null),
    nodeToDocument: (asset, id) => {
      const el = node(asset, id);
      const m = el && canvas.host ? nodeToDocument(canvas.host, el) : null;
      return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : null;
    },
    nodeBounds: (asset, id) => {
      const el = node(asset, id);
      return el && canvas.host ? nodeBoundsInDocument(canvas.host, el) : null;
    },
    run: (id, args) => actions.run(id, args),
    actions: () => actions.describe(),
    runCommand: (json) => {
      try {
        store()?.runCommand(json);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    lastCommand: () => store()?.lastCommandJson() ?? null,
    menuSpec: () => menus.spec(),
  };
}
