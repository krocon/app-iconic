import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeKeymapApi } from '../../../testing/fake-menu-api';
import { KeymapApi } from '../menu/menu-api';
import { ActionService } from './action.service';
import { OS } from './platform';

function setup(os: 'mac' | 'other' = 'mac') {
  const keymap = new FakeKeymapApi();
  TestBed.configureTestingModule({
    providers: [
      { provide: OS, useValue: os },
      { provide: KeymapApi, useValue: keymap },
    ],
  });
  return { actions: TestBed.inject(ActionService), keymap };
}

describe('ActionService (design 005 E3)', () => {
  it('the last registration wins; the one before comes back', () => {
    const { actions } = setup();
    const ran: string[] = [];
    const offA = actions.register('file.save', { run: () => ran.push('a') });
    const offB = actions.register('file.save', { run: () => ran.push('b') });
    actions.run('file.save');
    offB();
    actions.run('file.save');
    offA();
    expect(actions.run('file.save')).toBe(false);
    expect(ran).toEqual(['b', 'a']);
    expect(() => actions.register('no.such', { run: () => undefined })).toThrow();
  });

  it('removes handlers with the DestroyRef', () => {
    const { actions } = setup();
    const callbacks: (() => void)[] = [];
    const ref = { onDestroy: (f: () => void) => callbacks.push(f) } as unknown as DestroyRef;
    actions.registerAll({ 'file.open': { run: () => undefined } }, ref);
    expect(actions.available('file.open')).toBe(true);
    callbacks.forEach((f) => f());
    expect(actions.available('file.open')).toBe(false);
  });

  it('enabled, checked, dynamic labels and tooltips', () => {
    const { actions } = setup();
    let on = false;
    actions.register('edit.undo', {
      run: () => undefined,
      enabled: () => on,
      label: () => 'Undo Change Fill',
    });
    actions.register('view.rulers', { run: () => undefined, checked: () => true });
    expect(actions.enabled('edit.undo')).toBe(false);
    expect(actions.run('edit.undo')).toBe(false);
    on = true;
    expect(actions.run('edit.undo')).toBe(true);
    expect(actions.label('edit.undo')).toBe('Undo Change Fill');
    expect(actions.label('file.exportPng')).toBe('Export PNG…');
    expect(actions.checked('view.rulers')).toBe(true);
    expect(actions.shortcut('file.save')).toBe('⌘S');
    expect(actions.tooltip('edit.undo')).toBe('Undo Change Fill (⌘Z)');
  });

  it('checks serialisable arguments before running', () => {
    const { actions } = setup();
    const got: unknown[] = [];
    actions.register('view.zoomTo', { run: (a) => got.push(a) });
    actions.register('file.save', { run: (a) => got.push(a) });
    expect(actions.run('view.zoomTo', { zoom: 0.5 })).toBe(true);
    expect(actions.run('view.zoomTo', { zoom: 'big' })).toBe(false);
    expect(actions.run('file.save', { path: '/x' })).toBe(false);
    expect(actions.run('file.save')).toBe(true);
    expect(got).toEqual([{ zoom: 0.5 }, undefined]);
  });

  it('describes every action for the AI (MCP, prompt 018)', () => {
    const { actions } = setup('other');
    actions.register('view.rulers', { run: () => undefined, checked: () => false });
    const all = actions.describe();
    const rulers = all.find((a) => a.id === 'view.rulers')!;
    expect(rulers).toMatchObject({ enabled: true, checked: false, group: 'view' });
    const zoomTo = all.find((a) => a.id === 'view.zoomTo')!;
    expect(zoomTo.enabled).toBe(false);
    expect(zoomTo.args?.required).toEqual(['zoom']);
    expect(all.find((a) => a.id === 'file.save')!.shortcut).toBe('Ctrl+S');
    expect(JSON.parse(JSON.stringify(all))).toEqual(all);
  });

  it('loads keymap.json overrides', async () => {
    const { actions, keymap } = setup('other');
    keymap.overrides = { bindings: { 'file.save': ['F2'] }, warning: null };
    await actions.loadOverrides();
    expect(actions.shortcut('file.save')).toBe('F2');
  });

  it('follows keymap-changed of any window (design 085 E3)', async () => {
    const { actions, keymap } = setup('other');
    await actions.loadOverrides();
    expect(actions.shortcut('transform.rotate')).toBe('Shift+R');
    await keymap.save({ 'transform.rotate': ['q'] });
    expect(actions.chords('transform.rotate')).toEqual(['q']);
    expect(actions.overrides()).toEqual({ 'transform.rotate': ['q'] });
    actions.applyOverrides({ bindings: {} });
    expect(actions.chords('transform.rotate')).toEqual(['Shift+r']);
  });
});
