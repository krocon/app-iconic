import { IconJson, SaveAsset } from '../app/core/icon-file/icon-file.models';
import { CAMSCANNER_ICON } from './fixtures/camscanner-icon';
import { FakeIconFileApi } from './fake-icon-file-api';

/** The fake follows the backend's rules (design 002 E3, E5) – 003 builds on them. */
describe('FakeIconFileApi', () => {
  const PATH = FakeIconFileApi.CAMSCANNER;
  let api: FakeIconFileApi;

  beforeEach(() => (api = new FakeIconFileApi()));

  const unchanged = (names: string[]): SaveAsset[] =>
    names.map((name) => ({ name, unchanged: true }));

  it('opens the camscanner fixture with layer opacity and both SVG assets', async () => {
    const doc = await api.openIcon(PATH);
    expect(doc.path).toBe(PATH);
    expect(doc.name).toBe('camscanner.icon');
    expect(doc.format).toBe('bundle');
    expect(doc.iconJson.groups?.[0].layers?.[0].opacity).toBe(1);
    expect(doc.assets.map((a) => [a.name, a.kind])).toEqual([
      ['logo-scanner 3.svg', 'svg'],
      ['logo-scanner-2 2.svg', 'svg'],
    ]);
    expect(doc.assets[0].text).toContain('<svg');
    expect(doc.warnings).toEqual([]);
  });

  it('saves an unchanged document exactly as read', async () => {
    const doc = await api.openIcon(PATH);
    await api.saveIcon({
      path: PATH,
      format: doc.format,
      iconJson: structuredClone(doc.iconJson),
      assets: unchanged(doc.assets.map((a) => a.name)),
    });
    expect(api.files.get(PATH)?.iconJson).toBe(CAMSCANNER_ICON.iconJson);
  });

  it('saves as a new path, taking unchanged assets from the opened one', async () => {
    const doc = await api.openIcon(PATH);
    const iconJson: IconJson = { ...doc.iconJson, 'x-future': { a: 1 } };
    await api.saveIcon({
      path: '/out/new.icon',
      format: 'zip',
      iconJson,
      assets: [
        { name: 'logo-scanner 3.svg', unchanged: true },
        { name: 'logo-scanner-2 2.svg', unchanged: false, text: '<svg>new</svg>' },
      ],
      from: PATH,
    });
    expect(api.saved[0].path).toBe('/out/new.icon');
    const saved = api.files.get('/out/new.icon')!;
    expect(saved.format).toBe('zip');
    expect(JSON.parse(saved.iconJson)['x-future']).toEqual({ a: 1 });
    expect(saved.assets[0].text).toBe(CAMSCANNER_ICON.assets[0].text);
    expect(saved.assets[1].text).toBe('<svg>new</svg>');
    expect(api.saved).toHaveLength(1);
    const reopened = await api.openIcon('/out/new.icon');
    expect(reopened.iconJson['x-future']).toEqual({ a: 1 });
  });

  it('reports the errors of the backend', async () => {
    await expect(api.openIcon('/nope.icon')).rejects.toMatchObject({ code: 'not_found' });
    const doc = await api.openIcon(PATH);
    const save = (assets: SaveAsset[]) =>
      api.saveIcon({ path: PATH, format: 'bundle', iconJson: doc.iconJson, assets });
    await expect(save(unchanged(['gone.svg']))).rejects.toMatchObject({ code: 'missing_asset' });
    await expect(save([{ name: 'a.svg', unchanged: false }])).rejects.toMatchObject({
      code: 'invalid_icon',
    });
    await expect(
      save(unchanged(['logo-scanner 3.svg', 'LOGO-scanner 3.svg'])),
    ).rejects.toMatchObject({
      code: 'invalid_path',
    });
    api.failNext = { code: 'too_large', message: 'x' };
    await expect(api.openIcon(PATH)).rejects.toMatchObject({ code: 'too_large' });
    await expect(api.openIcon(PATH)).resolves.toBeTruthy();
  });

  it('warns about missing assets', async () => {
    api.files.set('/m.icon', {
      format: 'zip',
      iconJson: '{"groups":[{"layers":[{"image-name":"gone.svg"}]}]}',
      assets: [],
    });
    const doc = await api.openIcon('/m.icon');
    expect(doc.warnings).toEqual([{ code: 'missing_asset', name: 'gone.svg' }]);
  });

  it('creates a new document like the backend and answers dialogs in order', async () => {
    const doc = await api.newIcon();
    expect(doc.path).toBeNull();
    expect(doc.name).toBeNull();
    expect(doc.iconJson['supported-platforms']).toEqual({
      circles: ['watchOS'],
      squares: 'shared',
    });
    expect(doc.assets[0].name).toBe('layer.svg');
    api.picks.push('/a.icon', null);
    expect(await api.pickOpenIcon()).toBe('/a.icon');
    expect(await api.pickSaveIcon()).toBeNull();
    expect(await api.pickSvgFile()).toBeNull();
    api.fallbackPick = (kind, name) => (kind === 'save' ? `/browser/${name}` : null);
    expect(await api.pickSaveIcon('x.icon')).toBe('/browser/x.icon');
    expect(await api.pickOpenIcon()).toBeNull();
    api.svgFiles.set('/x.svg', { name: 'x.svg', text: '<svg/>' });
    expect(await api.readSvgFile('/x.svg')).toEqual({ name: 'x.svg', text: '<svg/>' });
  });
});
