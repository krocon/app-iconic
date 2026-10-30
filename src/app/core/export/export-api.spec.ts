import { TauriExportApi } from './export-api';

describe('TauriExportApi without Tauri', () => {
  it('reports backend_unavailable for every call', async () => {
    const api = new TauriExportApi();
    const opts = { baseName: 'x', overwrite: false };
    for (const p of [
      api.pickExportDir(),
      api.exportSvg([], '/d', opts),
      api.exportPng([], [16], '/d', opts, () => undefined),
      api.exportPackage({ kind: 'ico' }, [], '/d', opts, () => undefined),
      api.cancelExport(),
      api.copyPng('<svg/>', 1024),
    ]) {
      await expect(p).rejects.toMatchObject({ code: 'backend_unavailable' });
    }
  });
});
