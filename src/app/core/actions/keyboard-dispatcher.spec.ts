import { TestBed } from '@angular/core/testing';
import { ActionContext } from './action-catalog';
import { ActionService } from './action.service';
import { KeyboardDispatcher } from './keyboard-dispatcher';
import { OS } from './platform';

function setup(os: 'mac' | 'other' = 'other') {
  TestBed.configureTestingModule({ providers: [{ provide: OS, useValue: os }] });
  const actions = TestBed.inject(ActionService);
  const dispatcher = TestBed.inject(KeyboardDispatcher);
  const ran: string[] = [];
  let dialog = false;
  dispatcher.setContextProvider((t): ActionContext[] =>
    dialog ? ['dialog'] : t?.closest('.tree') ? ['hierarchy', 'global'] : ['canvas', 'global'],
  );
  dispatcher.attach(document);
  const reg = (id: string, enabled = () => true) =>
    actions.register(id, { run: () => ran.push(id), enabled });
  return { actions, dispatcher, ran, reg, openDialog: () => (dialog = true) };
}

function key(target: Element, k: string, init: KeyboardEventInit = {}, type = 'keydown') {
  const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe('KeyboardDispatcher (design 005 E4)', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = `<div class="canvas" tabindex="0"></div><div class="tree" tabindex="0"></div>
      <input id="t" type="text"><div id="ce" contenteditable="true"></div>
      <button id="b">x</button><input id="r" type="range">`;
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    TestBed.resetTestingModule();
  });
  const el = (sel: string) => host.querySelector(sel)!;

  it('runs the action of a chord (Ctrl = Mod outside macOS, ⌘ on macOS)', () => {
    const { ran, reg } = setup();
    reg('file.save');
    expect(key(el('.canvas'), 's', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(ran).toEqual(['file.save']);
  });

  it('uses ⌘ on macOS', () => {
    const { ran, reg } = setup('mac');
    reg('file.save');
    key(el('.canvas'), 's', { ctrlKey: true });
    key(el('.canvas'), 's', { metaKey: true });
    expect(ran).toEqual(['file.save']);
  });

  it('rests in text fields (except Mod shortcuts) and in open dialogs', () => {
    const { ran, reg, openDialog } = setup();
    reg('edit.delete');
    reg('file.open');
    expect(key(el('#t'), 'Delete').defaultPrevented).toBe(false);
    expect(key(el('#ce'), 'Backspace').defaultPrevented).toBe(false);
    key(el('#t'), 'o', { ctrlKey: true });
    expect(ran).toEqual(['file.open']);
    key(el('.canvas'), 'Delete');
    expect(ran).toEqual(['file.open', 'edit.delete']);
    openDialog();
    key(el('.canvas'), 'o', { ctrlKey: true });
    key(el('.canvas'), 'Delete');
    expect(ran).toEqual(['file.open', 'edit.delete']);
  });

  it('leaves clipboard and undo keys to text fields (nativeInText)', () => {
    const { ran, reg } = setup();
    reg('edit.copy');
    reg('edit.undo');
    expect(key(el('#t'), 'c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(el('#t'), 'z', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
    key(el('.canvas'), 'c', { ctrlKey: true });
    expect(ran).toEqual(['edit.copy']);
  });

  it('a disabled action lets the key through', () => {
    const { ran, reg } = setup();
    reg('file.save', () => false);
    expect(key(el('.canvas'), 's', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
  });

  it('buttons keep Space/Enter, sliders their arrows, menus their keys', () => {
    const { actions, ran } = setup();
    actions.register('canvas.panHold', { run: () => ran.push('pan') });
    expect(key(el('#b'), ' ').defaultPrevented).toBe(false);
    const menu = document.createElement('ul');
    menu.setAttribute('role', 'menu');
    host.appendChild(menu);
    key(menu, ' ');
    expect(ran).toEqual([]);
  });

  it('hold actions run while the key is down (Space = pan) and end on key up or blur', () => {
    const { actions } = setup();
    const log: string[] = [];
    actions.register('canvas.panHold', {
      run: () => log.push('down'),
      release: () => log.push('up'),
    });
    expect(key(el('.canvas'), ' ').defaultPrevented).toBe(true);
    expect(key(el('.canvas'), ' ', { repeat: true }).defaultPrevented).toBe(true);
    key(el('.canvas'), ' ', {}, 'keyup');
    expect(log).toEqual(['down', 'up']);
    key(el('.canvas'), ' ');
    window.dispatchEvent(new Event('blur'));
    expect(log).toEqual(['down', 'up', 'down', 'up']);
    // canvas keys do not work in the hierarchy
    key(el('.tree'), ' ');
    expect(log).toHaveLength(4);
  });

  it('repeats only actions that allow it', () => {
    const { ran, reg } = setup();
    reg('view.zoomIn');
    reg('file.save');
    key(el('.canvas'), '=', { ctrlKey: true, repeat: true });
    key(el('.canvas'), 's', { ctrlKey: true, repeat: true });
    expect(ran).toEqual(['view.zoomIn']);
  });

  it('a lone Alt focuses the menu bar (Windows/Linux)', () => {
    const { ran, reg } = setup();
    reg('app.focusMenu');
    key(el('.canvas'), 'Alt', { altKey: true });
    key(el('.canvas'), 'Alt', {}, 'keyup');
    expect(ran).toEqual(['app.focusMenu']);
    key(el('.canvas'), 'Alt', { altKey: true });
    key(el('.canvas'), 'x', { altKey: true });
    key(el('.canvas'), 'Alt', {}, 'keyup');
    expect(ran).toEqual(['app.focusMenu']);
  });

  it('ignores keys while composing', () => {
    const { ran, reg } = setup();
    reg('edit.delete');
    key(el('.canvas'), 'Delete', { isComposing: true });
    expect(ran).toEqual([]);
  });

  it('records a shortcut without running an action (design 085 E4)', () => {
    const { ran, reg, dispatcher } = setup();
    reg('file.save');
    const got: (string | null)[] = [];
    const stop = dispatcher.record((c) => got.push(c));
    expect(dispatcher.recording()).toBe(true);
    // a key that reaches the document while recording runs nothing
    key(el('.canvas'), 's', { ctrlKey: true });
    expect(ran).toEqual([]);
    // the recording field hands its keys over: taken, not bubbling
    const field = el('#b');
    let bubbled = 0;
    host.addEventListener('keydown', () => bubbled++);
    field.addEventListener('keydown', (e) => dispatcher.capture(e as KeyboardEvent));
    const e = key(field, 'r', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    key(field, 'Shift', { shiftKey: true }); // a lone modifier
    key(field, 'r', { shiftKey: true, repeat: true }); // a repeat
    key(field, 'Escape'); // cancel
    expect(got).toEqual(['Shift+r', null]);
    expect(bubbled).toBe(0);
    stop();
    expect(dispatcher.recording()).toBe(false);
    key(el('.canvas'), 's', { ctrlKey: true });
    expect(ran).toEqual(['file.save']);
  });

  it('a newer recording replaces an older one; the old stop does nothing', () => {
    const { dispatcher } = setup();
    const stopA = dispatcher.record(() => undefined);
    const stopB = dispatcher.record(() => undefined);
    stopA();
    expect(dispatcher.recording()).toBe(true);
    stopB();
    expect(dispatcher.recording()).toBe(false);
  });
});
