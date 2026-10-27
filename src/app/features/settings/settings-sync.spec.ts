import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { language, setLanguage } from '../../core/i18n/i18n';
import { applyPatch } from '../../core/settings/settings-rules';
import { DEFAULT_SETTINGS } from '../../core/settings/settings.models';
import { fakeBackend } from '../../../testing/providers';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { logUndoGrouping } from '../document/undo/undo-log';
import { ExportService } from '../export/export.service';
import { FilesService } from '../files/files.service';
import { LayoutStore } from '../shell/layout.store';
import { FreehandStore } from '../tools/freehand.store';
import { SettingsSync } from './settings-sync';
import { SAVE_DELAY, SettingsStore } from './settings.store';

async function setup(patch = {}) {
  const b = fakeBackend();
  b.settings.stored = applyPatch(DEFAULT_SETTINGS, patch);
  TestBed.configureTestingModule({ providers: b.providers });
  const store = TestBed.inject(SettingsStore);
  await store.load();
  TestBed.inject(SettingsSync).start();
  TestBed.tick();
  return {
    api: b.settings,
    store,
    layout: TestBed.inject(LayoutStore),
    view: TestBed.inject(CanvasViewStore),
    exporter: TestBed.inject(ExportService),
    freehand: TestBed.inject(FreehandStore),
    files: TestBed.inject(FilesService),
  };
}

describe('SettingsSync (design 015 E6)', () => {
  afterEach(() => {
    vi.useRealTimers();
    setLanguage('en');
    document.documentElement.removeAttribute('data-theme');
    logUndoGrouping.set(false);
  });

  it('the stores start with the loaded settings', async () => {
    const { layout, view, exporter, freehand } = await setup({
      panels: { hierarchy: { visible: false, width: 333 } },
      canvas: {
        rulers: false,
        gridSize: 25,
        selectionMode: 'boxed',
        appearance: 'dark',
        zoom: 1.5,
      },
      export: { format: 'svg', sizes: [16], targetDir: '/out' },
      freehand: { epsilon: 4, strokeWidth: 3, closed: true },
    });
    expect(layout.panels().hierarchy).toBe(false);
    expect(layout.widths().hierarchy).toBe(333);
    expect(view.options()).toMatchObject({
      rulers: false,
      gridSize: 25,
      selectionMode: 'boxed',
      appearance: 'dark',
    });
    expect(view.chosenZoom()).toBe(1.5);
    view.setViewport(1000, 800);
    expect(view.zoom()).toBe(1.5);
    expect(exporter.choice()).toMatchObject({ format: 'svg', sizes: [16], targetDir: '/out' });
    expect([freehand.epsilon(), freehand.strokeWidth(), freehand.closed()]).toEqual([4, 3, true]);
  });

  it('changes in the stores become one saved patch – no echo', async () => {
    vi.useFakeTimers();
    const { api, store, layout, view } = await setup();
    layout.toggle('commands');
    layout.setWidth('properties', 400);
    view.toggle('guides');
    view.zoomTo(0.5);
    TestBed.tick();
    expect(store.settings().panels.commands.visible).toBe(false);
    expect(store.settings().panels.properties.width).toBe(400);
    expect(store.settings().canvas.guides).toBe(false);
    expect(store.settings().canvas.zoom).toBe(0.5);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY + 10);
    TestBed.tick();
    expect(api.saves.length).toBe(1);
    expect(api.stored.panels.properties.width).toBe(400);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY * 3);
    expect(api.saves.length).toBe(1);
  });

  it('a change of another window reaches the stores (not the zoom)', async () => {
    const { api, layout, view } = await setup();
    view.setViewport(1000, 800);
    const zoom = view.zoom();
    api.changeFromOtherWindow({
      panels: { commands: { width: 200 } },
      canvas: { snapToGrid: true, zoom: 2 },
    });
    TestBed.tick();
    expect(layout.widths().commands).toBe(200);
    expect(view.options().snapToGrid).toBe(true);
    expect(view.zoom()).toBe(zoom);
  });

  it('theme, language and the undo log follow the settings', async () => {
    const { store, api } = await setup({ theme: 'dark', language: 'de' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(language()).toBe('de');
    expect(api.themes).toEqual(['dark']);
    store.set('theme', 'system');
    store.set('language', 'en');
    store.set('debug.logUndoGrouping', true);
    TestBed.tick();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(language()).toBe('en');
    expect(logUndoGrouping()).toBe(true);
  });

  it('a broken settings.json is reported once', async () => {
    const b = fakeBackend();
    b.settings.warning = { code: 'broken', path: '/cfg/settings.json.bad' };
    TestBed.configureTestingModule({ providers: b.providers });
    await TestBed.inject(SettingsStore).load();
    TestBed.inject(SettingsSync).start();
    expect(TestBed.inject(FilesService).notice()).toContain('/cfg/settings.json.bad');
  });
});
