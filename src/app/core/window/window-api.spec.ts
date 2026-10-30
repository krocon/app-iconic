import { TauriWindowApi } from './window-api';
import { TauriRecentFilesApi } from '../recent/recent-files-api';
import { TauriKeymapApi, TauriMenuApi } from '../menu/menu-api';

type Calls = [string, Record<string, unknown> | undefined][];

function recording<T extends { backend: unknown }>(api: T, calls: Calls): T {
  (api as unknown as { backend: unknown }).backend = (
    command: string,
    args?: Record<string, unknown>,
  ) => {
    calls.push([command, args]);
    return Promise.resolve(null);
  };
  return api;
}

/** Argument names are the Rust parameter names in camelCase (Tauri's convention). */
describe('TauriWindowApi / TauriRecentFilesApi', () => {
  it('pass the arguments the commands expect', async () => {
    const calls: Calls = [];
    const w = recording(new TauriWindowApi() as unknown as { backend: unknown }, calls);
    const win = w as unknown as TauriWindowApi;
    await win.setTitle('a.icon', true, '/a.icon');
    await win.openDocumentWindow(null);
    await win.focusDocumentWindow('/a.icon');
    await win.startPath();
    await win.takeOverClose();
    await win.closeWindow();
    await win.quit();
    await win.cancelQuit();
    await win.startAction();
    const r = recording(new TauriRecentFilesApi() as unknown as { backend: unknown }, calls);
    const recent = r as unknown as TauriRecentFilesApi;
    await recent.list();
    await recent.add('/a.icon');
    await recent.clear();
    await recent.entries();
    await recent.saveThumbnail('/a.icon', '<svg/>');
    expect(calls).toEqual([
      ['set_window_title', { title: 'a.icon', edited: true, path: '/a.icon' }],
      ['open_document_window', { path: null }],
      ['focus_document_window', { path: '/a.icon' }],
      ['window_start_path', undefined],
      ['take_over_close', undefined],
      ['close_window', undefined],
      ['quit_app', undefined],
      ['cancel_quit', undefined],
      ['window_start_action', undefined],
      ['recent_files', undefined],
      ['add_recent_file', { path: '/a.icon' }],
      ['clear_recent_files', undefined],
      ['recent_entries', undefined],
      ['save_thumbnail', { path: '/a.icon', svg: '<svg/>' }],
    ]);
  });

  it('menu and keymap facades pass the arguments the commands expect', async () => {
    const calls: Calls = [];
    const m = recording(new TauriMenuApi() as unknown as { backend: unknown }, calls);
    const spec = { menus: [{ label: 'File', items: [] }] };
    await (m as unknown as TauriMenuApi).setAppMenu(spec);
    const k = recording(new TauriKeymapApi() as unknown as { backend: unknown }, calls);
    await (k as unknown as TauriKeymapApi).loadOverrides();
    expect(calls).toEqual([
      ['set_app_menu', { spec }],
      ['load_keymap_overrides', undefined],
    ]);
  });

  it('report a missing backend in the browser', async () => {
    await expect(new TauriWindowApi().startPath()).rejects.toMatchObject({
      code: 'backend_unavailable',
    });
  });
});
