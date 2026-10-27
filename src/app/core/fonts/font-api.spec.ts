import { TauriFontApi } from './font-api';

describe('TauriFontApi without Tauri', () => {
  it('reports backend_unavailable for every call', async () => {
    const api = new TauriFontApi();
    for (const p of [api.listFonts(), api.textToPath('A', 'X', 10, 0)]) {
      await expect(p).rejects.toMatchObject({ code: 'backend_unavailable' });
    }
  });
});
