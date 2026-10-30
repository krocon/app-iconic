import { TauriSymbolLibraryApi } from './symbol-library-api';

/** Records the calls instead of crossing the bridge. */
class RecordingApi extends TauriSymbolLibraryApi {
  readonly calls: [string, Record<string, unknown> | undefined][] = [];
  protected override backend = <T>(command: string, args?: Record<string, unknown>) => {
    this.calls.push([command, args]);
    return Promise.resolve(null as T);
  };
}

/** Argument names are the Rust parameter names in camelCase (Tauri's convention). */
describe('TauriSymbolLibraryApi', () => {
  it('passes the arguments the commands expect', async () => {
    const api = new RecordingApi();
    await api.list();
    await api.save('Star', ['shape'], '<svg/>');
    await api.update('star', 'Star 2', []);
    await api.remove('star');
    await api.recordUse({ set: 'tabler', id: 'heart' });
    await api.pickFolder();
    await api.importFolder('/in');
    await api.exportFolder('/out');
    expect(api.calls).toEqual([
      ['list_symbols', undefined],
      ['save_symbol', { name: 'Star', tags: ['shape'], svg: '<svg/>' }],
      ['update_symbol', { id: 'star', name: 'Star 2', tags: [] }],
      ['delete_symbol', { id: 'star' }],
      ['record_symbol_use', { set: 'tabler', id: 'heart' }],
      ['pick_export_dir', undefined],
      ['import_symbols', { path: '/in' }],
      ['export_symbols', { path: '/out' }],
    ]);
  });
});
