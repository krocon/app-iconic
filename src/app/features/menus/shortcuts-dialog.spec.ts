import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionService } from '../../core/actions/action.service';
import { KeyboardDispatcher } from '../../core/actions/keyboard-dispatcher';
import { OS } from '../../core/actions/platform';
import { fakeBackend } from '../../../testing/providers';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { registerKeymapActions } from './keymap-actions';
import { KeymapEditor } from './keymap-editor';
import { MenuService } from './menu.service';
import { ShortcutsDialog } from './shortcuts-dialog';

describe('shortcut editor (design 085)', () => {
  let backend: ReturnType<typeof fakeBackend>;

  function setup(os: 'mac' | 'other' = 'other') {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      imports: [ShortcutsDialog],
      providers: [...backend.providers, { provide: OS, useValue: os }],
    });
  }

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  async function open() {
    const fixture = TestBed.createComponent(ShortcutsDialog);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
    };
    const row = (id: string) => el.querySelector<HTMLElement>(`[data-action="${id}"]`)!;
    const filter = async (q: string) => {
      const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      input.value = q;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const press = async (k: string, init: KeyboardEventInit = {}) => {
      const rec = el.querySelector<HTMLElement>('[data-recorder]')!;
      expect(rec).not.toBeNull();
      rec.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
      );
      await settle();
    };
    return { fixture, el, row, filter, press, settle };
  }

  it('filters by name and by shortcut in the OS notation', async () => {
    const { el, filter } = await open();
    await filter('rotate tool');
    expect(
      [...el.querySelectorAll('app-shortcut-row')].map((r) => r.getAttribute('data-action')),
    ).toEqual(['transform.rotate']);
    await filter('ctrl+shift+p');
    expect(el.querySelector('[data-action="app.palette"]')).not.toBeNull();
    expect(el.querySelectorAll('app-shortcut-row').length).toBe(1);
    await filter('zzzz');
    expect(el.textContent).toContain('No shortcut matches.');
  });

  it('records a new shortcut in place of the clicked one, saves only deviations', async () => {
    const { el, row, filter, press } = await open();
    await filter('rotate tool');
    row('transform.rotate').querySelector<HTMLButtonElement>('.key')!.click();
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(KeyboardDispatcher).recording()).toBe(true);
    expect(document.activeElement?.hasAttribute('data-recorder')).toBe(true);
    await press('q');
    expect(TestBed.inject(KeyboardDispatcher).recording()).toBe(false);
    expect(TestBed.inject(ActionService).chords('transform.rotate')).toEqual(['q']);
    const saved = backend.keymap.saves.at(-1)!;
    expect(saved['transform.rotate']).toEqual(['q']);
    expect(Object.values(saved).filter((v) => v !== null)).toHaveLength(1);
    expect(row('transform.rotate').textContent).toContain('changed');
    // Reset puts the built-in one back and removes the entry
    row('transform.rotate').querySelector<HTMLButtonElement>('.reset')!.click();
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(ActionService).chords('transform.rotate')).toEqual(['Shift+r']);
    expect(backend.keymap.overrides.bindings).toEqual({});
    expect(el.querySelector('.reset')).toBeNull();
  });

  it('Esc cancels recording and does not close the dialog', async () => {
    const dialogs = TestBed.inject(DialogService);
    dialogs.show('shortcuts');
    const { row, filter, press } = await open();
    await filter('rotate tool');
    row('transform.rotate').querySelector<HTMLButtonElement>('.add')!.click();
    await new Promise((r) => setTimeout(r));
    await press('Escape');
    expect(dialogs.open()).toBe('shortcuts');
    expect(backend.keymap.saves).toEqual([]);
  });

  it('a conflict offers Swap, Replace and Cancel', async () => {
    const { row, filter, press } = await open();
    const actions = TestBed.inject(ActionService);
    await filter('rotate tool');
    row('transform.rotate').querySelector<HTMLButtonElement>('.key')!.click();
    await new Promise((r) => setTimeout(r));
    await press('s', { shiftKey: true });
    const note = row('transform.rotate').querySelector('.note')!;
    expect(note.textContent).toContain('Shift+S is already used by „Scale Tool“');
    expect(actions.chords('transform.rotate')).toEqual(['Shift+r']);
    note.querySelector<HTMLButtonElement>('.swap')!.click();
    await new Promise((r) => setTimeout(r));
    expect(actions.chords('transform.rotate')).toEqual(['Shift+s']);
    expect(actions.chords('transform.scale')).toEqual(['Shift+r']);
    // and once more, replacing: Scale loses it
    row('transform.rotate').querySelector<HTMLButtonElement>('.key')!.click();
    await new Promise((r) => setTimeout(r));
    await press('r', { shiftKey: true });
    row('transform.rotate').querySelector<HTMLButtonElement>('.replace')!.click();
    await new Promise((r) => setTimeout(r));
    expect(actions.chords('transform.rotate')).toEqual(['Shift+r']);
    expect(actions.chords('transform.scale')).toEqual([]);
  });

  it('refuses a reserved shortcut with its source', async () => {
    const { row, filter, press } = await open();
    await filter('rotate tool');
    row('transform.rotate').querySelector<HTMLButtonElement>('.add')!.click();
    await new Promise((r) => setTimeout(r));
    await press('F4', { altKey: true });
    expect(row('transform.rotate').querySelector('.note')!.textContent).toBe(
      'Alt+F4 is reserved by the system (Microsoft).',
    );
    expect(backend.keymap.saves).toEqual([]);
  });

  it('removes a shortcut; Reset All asks inline', async () => {
    const { el, row, filter, settle } = await open();
    const actions = TestBed.inject(ActionService);
    await filter('delete');
    row('edit.delete').querySelectorAll<HTMLButtonElement>('.x')[1].click();
    await settle();
    expect(actions.chords('edit.delete')).toEqual(['Delete']);
    el.querySelector<HTMLButtonElement>('.reset-all')!.click();
    await settle();
    el.querySelector<HTMLButtonElement>('.reset-yes')!.click();
    await settle();
    expect(actions.chords('edit.delete')).toEqual(['Delete', 'Backspace']);
  });

  it('shows the other OS read-only, with the same keymap.json', async () => {
    await TestBed.inject(KeymapEditor).set('transform.rotate', ['q']);
    const { el, row, filter, settle } = await open();
    el.querySelector<HTMLButtonElement>('[data-os="mac"]')!.click();
    await settle();
    expect(el.textContent).toContain('read-only');
    await filter('rotate tool');
    expect(row('transform.rotate').querySelector('.key')).toBeNull();
    expect(row('transform.rotate').querySelector('kbd')!.textContent).toBe('Q');
    await filter('quit');
    expect(row('app.quit').querySelector('kbd')!.textContent).toBe('⌘Q');
  });

  it('a failed save puts the shortcuts back and says so', async () => {
    const { el, settle } = await open();
    backend.keymap.failWith = { code: 'permission_denied', message: 'x' };
    const ok = await TestBed.inject(KeymapEditor).set('transform.rotate', ['q']);
    await settle();
    expect(ok).toBe(false);
    expect(TestBed.inject(ActionService).chords('transform.rotate')).toEqual(['Shift+r']);
    expect(el.querySelector('.error')!.textContent).toContain('Access denied');
  });
});

describe('shortcut editor on macOS (design 085 E4/E6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('keeps Quit fixed and drops the native accelerators while recording', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'mac' }],
    });
    const actions = TestBed.inject(ActionService);
    actions.register('file.save', { run: () => undefined });
    const menus = TestBed.inject(MenuService);
    const item = (spec: ReturnType<typeof menus.spec>) =>
      JSON.stringify(spec).includes('"accelerator":"Mod+s"');
    expect(item(menus.spec())).toBe(true);
    const stop = TestBed.inject(KeyboardDispatcher).record(() => undefined);
    expect(item(menus.spec())).toBe(false);
    expect(menus.spec().app?.settingsAccelerator).toBeUndefined();
    stop();
    expect(item(menus.spec())).toBe(true);
    expect(await TestBed.inject(KeymapEditor).set('app.quit', ['q'])).toBe(false);
  });
});

describe('keymap actions (design 085 E8)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('keymap.set and keymap.reset with checked arguments', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    const actions = TestBed.inject(ActionService);
    registerKeymapActions(
      actions,
      TestBed.inject(KeymapEditor),
      TestBed.inject(AskService),
      TestBed.inject(DialogService),
    );
    expect(
      await actions.runAsync('keymap.set', { action: 'transform.rotate', chords: ['Q'] }),
    ).toBe(true);
    expect(actions.chords('transform.rotate')).toEqual(['q']);
    expect(actions.run('keymap.set', { action: 'no.such', chords: [] })).toBe(false);
    expect(actions.run('keymap.set', { action: 'transform.rotate', chords: 'q' })).toBe(false);
    expect(await actions.runAsync('keymap.reset', { action: 'transform.rotate' })).toBe(true);
    expect(actions.chords('transform.rotate')).toEqual(['Shift+r']);
    await actions.runAsync('keymap.set', { action: 'tool.select', chords: ['g'] });
    expect(await actions.runAsync('keymap.reset', { confirm: false })).toBe(true);
    expect(actions.chords('tool.select')).toEqual(['v']);
  });
});
