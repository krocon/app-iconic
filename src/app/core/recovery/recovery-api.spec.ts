import { TauriRecoveryApi } from './recovery-api';

/** Records the calls instead of crossing the bridge. */
class RecordingApi extends TauriRecoveryApi {
  readonly calls: [string, Record<string, unknown> | undefined][] = [];
  protected override backend = <T>(command: string, args?: Record<string, unknown>) => {
    this.calls.push([command, args]);
    return Promise.resolve(null as T);
  };
}

/** Argument names are the Rust parameter names in camelCase (Tauri's convention). */
describe('TauriRecoveryApi', () => {
  it('passes the arguments the commands expect', async () => {
    const api = new RecordingApi();
    await api.write({
      id: null,
      path: '/a.icon',
      from: null,
      format: 'zip',
      iconJson: {},
      assets: [{ name: 'a.svg', unchanged: true }],
    });
    await api.list(true);
    await api.open('0123456789abcdef-1');
    await api.discard('0123456789abcdef-2');
    expect(api.calls).toEqual([
      [
        'write_recovery',
        {
          id: null,
          path: '/a.icon',
          from: null,
          format: 'zip',
          iconJson: {},
          assets: [{ name: 'a.svg', unchanged: true }],
        },
      ],
      ['list_recovery', { atStart: true }],
      ['open_recovery', { id: '0123456789abcdef-1' }],
      ['discard_recovery', { id: '0123456789abcdef-2' }],
    ]);
  });
});
