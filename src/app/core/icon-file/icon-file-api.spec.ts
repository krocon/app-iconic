import { TauriIconFileApi } from './icon-file-api';

/** Records the calls instead of crossing the bridge. */
class RecordingApi extends TauriIconFileApi {
  readonly calls: [string, Record<string, unknown> | undefined][] = [];
  protected override backend = <T>(command: string, args?: Record<string, unknown>) => {
    this.calls.push([command, args]);
    return Promise.resolve(null as T);
  };
}

/** Argument names are the Rust parameter names in camelCase (Tauri's convention). */
describe('TauriIconFileApi', () => {
  it('passes the arguments the commands expect', async () => {
    const api = new RecordingApi();
    await api.openIcon('/a.icon');
    await api.newIcon();
    await api.saveIcon({ path: '/b.icon', format: 'zip', iconJson: {}, assets: [] });
    await api.closeIcon('/b.icon');
    await api.readSvgFile('/c.svg');
    await api.pickOpenIcon(true);
    await api.pickSaveIcon('x.icon', 'bundle');
    await api.pickSvgFile();
    expect(api.calls).toEqual([
      ['open_icon', { path: '/a.icon' }],
      ['new_icon', undefined],
      ['save_icon', { path: '/b.icon', format: 'zip', iconJson: {}, assets: [], from: null }],
      ['close_icon', { path: '/b.icon' }],
      ['read_svg_file', { path: '/c.svg' }],
      ['pick_open_icon', { folder: true }],
      ['pick_save_icon', { suggestedName: 'x.icon', format: 'bundle' }],
      ['pick_svg_file', undefined],
    ]);
  });

  it('reports a missing backend in the browser', async () => {
    await expect(new TauriIconFileApi().openIcon('/a')).rejects.toMatchObject({
      code: 'backend_unavailable',
    });
  });
});
