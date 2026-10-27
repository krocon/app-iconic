import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsApi } from '../../core/settings/settings-api';
import { applyPatch } from '../../core/settings/settings-rules';
import { DEFAULT_SETTINGS } from '../../core/settings/settings.models';
import { FakeSettingsApi } from '../../../testing/fake-settings-api';
import { SAVE_DELAY, SettingsStore } from './settings.store';

function setup(api = new FakeSettingsApi()) {
  TestBed.configureTestingModule({ providers: [{ provide: SettingsApi, useValue: api }] });
  return { api, store: TestBed.inject(SettingsStore) };
}

describe('SettingsStore (design 015 E5)', () => {
  afterEach(() => vi.useRealTimers());

  it('loads, keeps the warning and starts with the defaults without a backend', async () => {
    const { api, store } = setup();
    api.stored = applyPatch(DEFAULT_SETTINGS, { theme: 'dark' });
    api.warning = { code: 'broken', path: '/cfg/settings.json.bad' };
    await store.load();
    expect(store.settings().theme).toBe('dark');
    expect(store.warning()?.code).toBe('broken');
    expect(store.loaded()).toBe(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const bare = TestBed.inject(SettingsStore);
    await bare.load();
    expect(bare.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('applies at once and saves one bundled patch', async () => {
    vi.useFakeTimers();
    const { api, store } = setup();
    await store.load();
    store.update({ panels: { commands: { width: 300 } } });
    store.update({ panels: { commands: { width: 320 } }, canvas: { rulers: false } });
    expect(store.settings().panels.commands.width).toBe(320);
    expect(api.saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY + 10);
    expect(api.saves).toEqual([
      { panels: { commands: { width: 320 } }, canvas: { rulers: false } },
    ]);
    expect(api.stored.canvas.rulers).toBe(false);
  });

  it('set checks key and kind and clamps like Rust', async () => {
    const { store } = setup();
    await store.load();
    expect(store.set('panels.hierarchy.width', 9999)).toBe(true);
    expect(store.settings().panels.hierarchy.width).toBe(480);
    expect(store.set('canvas.laser', true)).toBe(false);
    expect(store.set('theme', 4)).toBe(false);
    expect(store.set('language', 'de')).toBe(true);
    expect(store.settings().language).toBe('de');
  });

  it('another window’s change replaces the state; a waiting patch stays on top', async () => {
    vi.useFakeTimers();
    const { api, store } = setup();
    await store.load();
    store.update({ canvas: { guides: false } });
    api.changeFromOtherWindow({ theme: 'light', canvas: { guides: true } });
    expect(store.settings().theme).toBe('light');
    expect(store.settings().canvas.guides).toBe(false);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY + 10);
    expect(api.stored.theme).toBe('light');
    expect(api.stored.canvas.guides).toBe(false);
    // its own event is ignored (the answer of save is the state)
    api.changeFromOtherWindow({ theme: 'dark' }, api.label);
    expect(store.settings().theme).toBe('light');
  });

  it('reset: the defaults for every window', async () => {
    const { api, store } = setup();
    api.stored = applyPatch(DEFAULT_SETTINGS, { language: 'de', canvas: { gridSize: 20 } });
    await store.load();
    store.update({ theme: 'dark' });
    await store.reset();
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(api.stored).toEqual(DEFAULT_SETTINGS);
    await store.flush();
    expect(api.saves).toEqual([]);
  });

  it('a backend that cannot write keeps the settings for this run', async () => {
    const api = new FakeSettingsApi();
    api.failSave = true;
    const { store } = setup(api);
    await store.load();
    store.update({ theme: 'dark' });
    await store.flush();
    expect(store.settings().theme).toBe('dark');
  });

  it('the fake keeps the settings in a storage (browser mode, design 015 E18)', async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as unknown as Storage;
    const first = new FakeSettingsApi(storage);
    await first.save({ canvas: { rulers: false } });
    const second = new FakeSettingsApi(storage);
    expect((await second.load()).value.canvas.rulers).toBe(false);
  });
});
