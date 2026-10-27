import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { language, setLanguage } from '../../core/i18n/i18n';
import { fakeBackend } from '../../../testing/providers';
import { MenuService } from '../menus/menu.service';
import { SettingsSync } from './settings-sync';
import { SettingsStore } from './settings.store';

describe('settings in the window (design 015 E11–E14)', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
  });

  afterEach(() => {
    setLanguage('en');
    document.documentElement.removeAttribute('data-theme');
  });

  async function app() {
    await TestBed.inject(SettingsStore).load();
    TestBed.inject(SettingsSync).start();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const ctrl = (k: string) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true }),
    );

  it('Ctrl+, opens the dialog with five sections as tabs', async () => {
    const { fixture, el } = await app();
    ctrl(',');
    await fixture.whenStable();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('.title')!.textContent).toContain('Settings');
    const tabs = [...dialog.querySelectorAll('[role="tab"]')].map((t) => t.textContent!.trim());
    expect(tabs).toEqual(['General', 'Canvas', 'Snapping', 'Export', 'Advanced']);
    const tab = dialog.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toContain(
      'Canvas',
    );
    expect(document.activeElement?.id).toBe('settings-tab-canvas');
  });

  it('switching the language changes texts, action names and the native menu at once', async () => {
    const { fixture, el } = await app();
    const menus = TestBed.inject(MenuService);
    expect(menus.spec().menus[0].label).toBe('File');
    expect(menus.spec().app!.settings).toBe('Settings…');
    TestBed.inject(ActionService).run('app.settings');
    await fixture.whenStable();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="settings-language"]')!;
    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(language()).toBe('de');
    expect(el.querySelector('[role="dialog"] .title')!.textContent).toContain('Einstellungen');
    expect(menus.spec().menus[0].label).toBe('Datei');
    expect(menus.spec().app!.settings).toBe('Einstellungen …');
    expect(menus.spec().app!.quit).toBe('AppIconic beenden');
    expect(TestBed.inject(ActionService).label('file.open')).toBe('Öffnen …');
    const regions = [...el.querySelectorAll('[role="region"]')].map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(regions).toEqual(['Befehle', 'Hierarchie', 'Eigenschaften']);
  });

  it('theme and panel visibility apply at once', async () => {
    const { fixture, el } = await app();
    TestBed.inject(ActionService).run('app.settings');
    await fixture.whenStable();
    const theme = el.querySelector<HTMLSelectElement>('[data-testid="settings-theme"]')!;
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const box = el.querySelector<HTMLInputElement>('[data-testid="settings-panel-hierarchy"]')!;
    box.click();
    await fixture.whenStable();
    expect(el.querySelector('app-side-panel.hierarchy')).toBeNull();
    const width = el.querySelector<HTMLInputElement>('[data-testid="settings-width-commands"]')!;
    width.value = '9000';
    width.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('app-side-panel.commands')!.style.width).toBe('480px');
  });

  it('settings.set for the AI: checked, clamped, refused', async () => {
    const { fixture, el } = await app();
    const actions = TestBed.inject(ActionService);
    expect(actions.run('settings.set', { key: 'canvas.rulers', value: false })).toBe(true);
    expect(actions.run('settings.set', { key: 'canvas.rulers', value: 'no' })).toBe(false);
    expect(actions.run('settings.set', { key: 'nope', value: 1 })).toBe(false);
    expect(actions.run('view.panelWidth', { panel: 'properties', width: 50 })).toBe(true);
    await fixture.whenStable();
    expect(el.querySelectorAll('app-canvas-ruler').length).toBe(0);
    expect(el.querySelector<HTMLElement>('app-side-panel.properties')!.style.width).toBe('160px');
    expect(actions.run('view.panelWidth', { panel: 'properties' })).toBe(true);
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('app-side-panel.properties')!.style.width).toBe('300px');
  });

  it('Reset to Default asks first; confirm: false resets at once', async () => {
    const { fixture, el } = await app();
    const store = TestBed.inject(SettingsStore);
    const actions = TestBed.inject(ActionService);
    store.set('canvas.guides', false);
    actions.run('app.settings');
    await fixture.whenStable();
    el.querySelector<HTMLElement>('[data-testid="settings-tab-advanced"]')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLElement>('[data-testid="settings-reset"]')!.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const ask = el.querySelector('[role="alertdialog"], [role="dialog"]')!;
    expect(ask.textContent).toContain(
      'All persisted workspace settings will revert to their defaults.',
    );
    const reset = [...ask.querySelectorAll('button')].find(
      (b) => b.textContent!.trim() === 'Reset',
    )!;
    reset.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(store.settings().canvas.guides).toBe(true);
    // the settings dialog is back
    expect(el.querySelector('[data-testid="settings-tab-general"]')).not.toBeNull();
    el.querySelector<HTMLElement>('[data-testid="settings-close"]')!.click();
    await fixture.whenStable();
    store.set('theme', 'dark');
    expect(actions.run('settings.reset', { confirm: false })).toBe(true);
    await new Promise((r) => setTimeout(r));
    expect(store.settings().theme).toBe('system');
  });
});
