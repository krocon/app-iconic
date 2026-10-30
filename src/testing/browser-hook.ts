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
import {
  parseTransformList,
  serializeSteps,
  setPivot,
} from '../app/features/properties/transform-list';
import { stepsMatrix } from '../app/features/properties/transform-matrix';
import { CanvasViewStore } from '../app/features/canvas/canvas-view.store';
import { Hit, hitTest } from '../app/features/canvas/hit-test';
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
import { FakeExportApi } from './fake-export-api';
import { ExportApi } from '../app/core/export/export-api';
import { SettingsApi } from '../app/core/settings/settings-api';
import { Settings } from '../app/core/settings/settings.models';
import { SettingsStore } from '../app/features/settings/settings.store';
import { FakeSettingsApi } from './fake-settings-api';
import { McpStore } from '../app/features/mcp/mcp.store';
import { DropApi } from '../app/core/drop/drop-api';
import { DroppedFile, FileDropEvent } from '../app/core/drop/drop.models';
import { ImageFileDto } from '../app/core/icon-file/icon-file.models';
import { FakeDropApi } from './fake-drop-api';

/**
 * `window.__appIconic` – the test hook of the browser mode (design 003 E14): Playwright reaches
 * the fakes and runs document commands through it ("change an attribute over a test hook",
 * prompt 003). Installed only by `backend-providers.dev.ts` outside Tauri.
 */
export interface AppIconicHook {
  files: FakeIconFileApi;
  window: FakeWindowApi;
  recent: FakeRecentFilesApi;
  /** The export backend in memory (design 012). */
  exporter: FakeExportApi;
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
  /** The painted element under a client point (`hitTest`, design 007 E2). */
  hit(clientX: number, clientY: number): Hit | null;
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
  /** `stepsMatrix(parseTransformList(text))` as `[a, b, c, d, e, f]` (design 009 E7, 033 E3). */
  transformListMatrix(text: string): number[] | null;
  /** "Use pivot" of step `index` around (x, y) with the browser's matrices (033 E3). */
  transformPivot(text: string, index: number, x: number, y: number): string | null;
  /** The settings of this window now (design 015). */
  settings(): Settings;
  /** The settings backend in memory + localStorage ("settings.json" of the browser mode). */
  settingsApi: FakeSettingsApi;
  /** Sends a waiting settings change now. */
  flushSettings(): Promise<void>;
  /**
   * Runs an MCP tool in this window as a call over the bridge would (design 018 E19): the
   * result, or `{ error: { code, message } }`.
   */
  mcp(tool: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Plays a drag of files from the system onto the window (design 071): enter, over, drop. */
  dropFiles(files: DroppedFile[], clientX: number, clientY: number, phases?: string[]): void;
  /** An image file `readImageFile` returns (design 008, 071). */
  addImageFile(path: string, image: ImageFileDto): void;
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
  const exporter = inject(ExportApi) as FakeExportApi;
  const service = inject(FilesService);
  const store = () => service.store();
  const svgOf = (asset: string) => store()?.document().assets.get(asset)?.svg ?? null;
  const canvas = inject(CanvasViewStore);
  const actions = inject(ActionService);
  const menus = inject(MenuService);
  const settings = inject(SettingsStore);
  const settingsApi = inject(SettingsApi) as FakeSettingsApi;
  const mcp = inject(McpStore);
  const drop = inject(DropApi) as FakeDropApi;
  const node = (asset: string, id: string) =>
    (store()?.document().node({ asset, id }) as SVGGraphicsElement | null) ?? null;
  window.__appIconic = {
    files,
    window: win,
    recent,
    exporter,
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
    dropFiles: (dropped, x, y, phases = ['enter', 'over', 'drop']) => {
      for (const phase of phases) {
        drop.emit({
          phase,
          files: phase === 'enter' || phase === 'drop' ? dropped : [],
          x,
          y,
        } as FileDropEvent);
      }
    },
    addImageFile: (path, image) => files.imageFiles.set(path, image),
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
    hit: (clientX, clientY) =>
      canvas.layers ? hitTest(canvas.layers, { clientX, clientY }) : null,
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
    transformListMatrix: (text) => {
      const steps = parseTransformList(text);
      if (!steps) return null;
      const m = stepsMatrix(steps);
      return [m.a, m.b, m.c, m.d, m.e, m.f];
    },
    transformPivot: (text, index, x, y) => {
      const steps = parseTransformList(text);
      return steps ? serializeSteps(setPivot(steps, index, { x, y }, (s) => stepsMatrix(s))) : null;
    },
    settings: () => settings.settings(),
    settingsApi,
    flushSettings: () => settings.flush(),
    mcp: (tool, args) => mcp.execute(tool, args ?? {}).catch((error: unknown) => ({ error })),
  };
}
