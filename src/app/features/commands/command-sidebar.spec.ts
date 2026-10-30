import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { registerAddActions } from './add-actions';
import { AddService } from './add.service';
import { CommandSidebar } from './command-sidebar';
import { COMMAND_ICONS } from './command-icons';
import { SvgSnippetDialog } from './svg-snippet-dialog';

describe('CommandSidebar (design 008 E10)', () => {
  let store: DocumentStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    registerAddActions(TestBed.inject(ActionService), TestBed.inject(AddService));
  });

  async function render() {
    const fixture = TestBed.createComponent(CommandSidebar);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    const options = () => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
    const key = async (k: string) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
    };
    const type = async (q: string) => {
      input.value = q;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, input, options, key, type };
  }

  const ids = (els: HTMLElement[]) => els.map((o) => o.dataset['action'] ?? o.dataset['group']);
  const submenu = () =>
    Array.from(document.querySelectorAll<HTMLElement>('#command-sub [role="option"]'));

  it('lists the add actions, the variants of a shape as a submenu; later ones disabled', async () => {
    const { options, el } = await render();
    expect(ids(options())).toEqual([
      'tool.select',
      'tool.direct',
      'add.iconGroup',
      'add.container',
      'line',
      'rectangle',
      'circle',
      'arc',
      'polygon',
      'ellipse',
      'path',
      'editPath',
      'combine',
      'pattern',
      'measure',
      'constrain',
      'more',
      'add.freehand',
      'fill.tool',
      'add.text',
      'add.textToPath',
      'add.symbol',
      'add.svgSnippet',
      'add.image',
    ]);
    const image = options().find((o) => o.dataset['action'] === 'add.image')!;
    expect(image.textContent).toContain('Ctrl+I');
    const circle = options().find((o) => o.dataset['group'] === 'circle')!;
    expect(circle.getAttribute('aria-label')).toBe('Circle, submenu');
    const free = options().find((o) => o.dataset['action'] === 'add.freehand')!;
    expect(free.getAttribute('aria-disabled')).toBe('true');
    free.click();
    expect(store.selection()).toEqual([]);
    expect(el.textContent).toContain('Shapes');
    expect(submenu()).toHaveLength(0);
  });

  it('filters flat over all variants, moves with the keys and runs with Enter', async () => {
    const { options, input, key, type } = await render();
    await type('poly');
    expect(ids(options())).toEqual([
      'add.polyline',
      'add.polygon',
      'sketch.dragPolygon',
      'sketch.polygonCircumscribed',
      'sketch.polygonInscribed',
      'sketch.polygonEdge',
    ]);
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-1');
    await key('Enter');
    expect(store.document().node(store.selection()[0])!.localName).toBe('polygon');
    await type('circle');
    expect(ids(options())).toContain('sketch.circle3t');
    await type('zzz');
    expect(options()).toHaveLength(0);
    await key('Escape');
    expect(options()).toHaveLength(24);
    await key('End');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-23');
  });

  it('keyboard: → opens the submenu, ↑/↓ move in it, ← closes, Enter runs', async () => {
    const { input, key } = await render();
    for (let i = 0; i < 6; i++) await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-6');
    await key('ArrowRight');
    expect(ids(submenu())).toEqual([
      'add.circle',
      'sketch.circleCenter',
      'sketch.circle2p',
      'sketch.circle3p',
      'sketch.circle2t',
      'sketch.circle3t',
    ]);
    expect(input.getAttribute('aria-activedescendant')).toBe('command-sub-0');
    expect(input.getAttribute('aria-controls')).toBe('command-list command-sub');
    await key('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-sub-5');
    await key('ArrowLeft');
    expect(submenu()).toHaveLength(0);
    expect(input.getAttribute('aria-activedescendant')).toBe('command-6');
    await key('Enter');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-sub-0');
    await key('Enter');
    expect(submenu()).toHaveLength(0);
    expect(store.document().node(store.selection()[0])!.localName).toBe('circle');
  });

  it('a click opens the submenu, a click in it runs; hovering opens another', async () => {
    const { options, fixture } = await render();
    options()
      .find((o) => o.dataset['group'] === 'rectangle')!
      .click();
    await fixture.whenStable();
    expect(ids(submenu())[0]).toBe('add.rect');
    options()
      .find((o) => o.dataset['group'] === 'arc')!
      .dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((r) => setTimeout(r, 200));
    await fixture.whenStable();
    expect(ids(submenu())).toEqual([
      'sketch.dragArc',
      'sketch.arc3p',
      'sketch.arcCenter',
      'sketch.arcTangent',
    ]);
    options()
      .find((o) => o.dataset['group'] === 'rectangle')!
      .click();
    await fixture.whenStable();
    submenu()[0].click();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(submenu()).toHaveLength(0);
    expect(store.document().node(store.selection()[0])!.localName).toBe('rect');
  });

  it('folded: icons only as a tool bar; a shape opens its submenu, keys too', async () => {
    const fixture = TestBed.createComponent(CommandSidebar);
    fixture.componentRef.setInput('compact', true);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input')).toBeNull();
    const tools = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'));
    expect(tools).toHaveLength(24);
    expect(el.querySelectorAll('[role="separator"]')).toHaveLength(4);
    const circle = tools.find((b) => b.dataset['group'] === 'circle')!;
    expect(circle.getAttribute('aria-haspopup')).toBe('listbox');
    expect(circle.title).toBe('Circle');
    circle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(circle.getAttribute('aria-expanded')).toBe('true');
    expect(circle.getAttribute('aria-activedescendant')).toBe('command-sub-0');
    circle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(circle.getAttribute('aria-activedescendant')).toBe('command-sub-1');
    circle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(submenu()).toHaveLength(0);
    tools.find((b) => b.dataset['action'] === 'add.text')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.document().node(store.selection()[0])!.localName).toBe('text');
  });

  it('runs a click', async () => {
    const { options } = await render();
    options()
      .find((o) => o.dataset['action'] === 'add.text')!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.document().node(store.selection()[0])!.localName).toBe('text');
  });

  it('shows the active tool: checked option, pressed tool, the group with its variant (prompt 061)', async () => {
    const actions = TestBed.inject(ActionService);
    const on = signal<string | null>(null);
    const toggle = (id: string) => ({
      run: () => on.set(on() === id ? null : id),
      checked: () => on() === id,
    });
    actions.registerAll({
      'tool.select': { run: () => on.set(null), checked: () => on() === null },
      'pen.tool': toggle('pen.tool'),
      'add.freehand': toggle('add.freehand'),
    });
    const { options, fixture } = await render();
    const opt = (id: string) => options().find((o) => o.dataset['action'] === id)!;
    const group = (g: string) => options().find((o) => o.dataset['group'] === g)!;
    expect(opt('tool.select').getAttribute('aria-checked')).toBe('true');
    expect(opt('tool.select').classList).toContain('checked');
    expect(opt('add.iconGroup').getAttribute('aria-checked')).toBeNull();
    on.set('pen.tool');
    await fixture.whenStable();
    expect(opt('tool.select').getAttribute('aria-checked')).toBe('false');
    const path = group('path');
    expect(path.classList).toContain('checked');
    expect(path.getAttribute('aria-label')).toBe('Path, submenu, active: Pen');
    const penIcon = COMMAND_ICONS['pen.tool'];
    expect(path.querySelector('path')!.getAttribute('d')).toBe(penIcon);
    // off again: the group keeps the icon of the last used variant
    on.set(null);
    await fixture.whenStable();
    expect(group('path').classList).not.toContain('checked');
    expect(group('path').querySelector('path')!.getAttribute('d')).toBe(penIcon);
    on.set('add.freehand');
    await fixture.whenStable();
    expect(opt('add.freehand').getAttribute('aria-checked')).toBe('true');
  });

  it('folded: the active tool is pressed', async () => {
    const actions = TestBed.inject(ActionService);
    const on = signal(true);
    actions.register('tool.select', { run: () => on.set(true), checked: () => on() });
    const fixture = TestBed.createComponent(CommandSidebar);
    fixture.componentRef.setInput('compact', true);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const sel = el.querySelector<HTMLButtonElement>('[data-action="tool.select"]')!;
    expect(sel.getAttribute('aria-pressed')).toBe('true');
    on.set(false);
    await fixture.whenStable();
    expect(sel.getAttribute('aria-pressed')).toBe('false');
    expect(
      el.querySelector('[data-action="add.iconGroup"]')!.getAttribute('aria-pressed'),
    ).toBeNull();
  });
});

describe('SvgSnippetDialog (design 008 E9)', () => {
  it('shows the error live and adds valid markup', async () => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    const store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    const dialogs = TestBed.inject(DialogService);
    dialogs.show('svgSnippet');
    const fixture = TestBed.createComponent(SvgSnippetDialog);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const area = el.querySelector('textarea')!;
    const addBtn = el.querySelector<HTMLButtonElement>('[data-testid="snippet-add"]')!;
    const type = async (v: string) => {
      area.value = v;
      area.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    expect(el.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(addBtn.disabled).toBe(true);
    expect(el.querySelector('[role="alert"]')!.textContent!.trim()).toBe('');
    await type('<rect');
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('not valid');
    expect(area.getAttribute('aria-invalid')).toBe('true');
    await type('<circle r="4"/>');
    expect(addBtn.disabled).toBe(false);
    addBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    expect(store.document().node(store.selection()[0])!.localName).toBe('circle');
    expect(dialogs.open()).toBeNull();
  });
});
