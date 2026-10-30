import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeClipboardApi } from '../../../testing/fake-clipboard-api';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { KeyboardDispatcher } from '../../core/actions/keyboard-dispatcher';
import { OS } from '../../core/actions/platform';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { registerEditActions } from './edit-actions';
import { EditService } from './edit.service';
import { HierarchyTree, VIRTUAL_FROM } from './hierarchy-tree';

describe('HierarchyTree', () => {
  let clipboard: FakeClipboardApi;

  beforeEach(() => {
    clipboard = new FakeClipboardApi();
    TestBed.configureTestingModule({
      providers: [
        ...fakeBackend().providers,
        { provide: OS, useValue: 'other' },
        { provide: ClipboardApi, useValue: clipboard },
      ],
    });
  });

  async function render(doc: IconDocument = treeDocument()) {
    const store = new DocumentStore(doc);
    TestBed.inject(FilesService).store.set(store);
    const actions = TestBed.inject(ActionService);
    registerEditActions(actions, TestBed.inject(EditService), TestBed.inject(DialogService));
    const dispatcher = TestBed.inject(KeyboardDispatcher);
    dispatcher.setContextProvider((t) =>
      t?.closest('[role="tree"]') ? ['hierarchy', 'global'] : ['global'],
    );
    const fixture = TestBed.createComponent(HierarchyTree);
    fixture.componentRef.setInput('store', store);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const row = (id: string) => el.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
    const key = async (k: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
      Object.defineProperty(e, 'target', { value: document.activeElement });
      dispatcher.handle(e);
      await fixture.whenStable();
    };
    const sel = () => ({ nodes: store.selection().map((r) => r.id), items: store.items() });
    return { fixture, el, store, row, key, sel, actions };
  }

  afterEach(() => document.body.replaceChildren());

  it('renders an APG tree with levels, positions, swatches and eye buttons', async () => {
    const { el, row } = await render();
    const tree = el.querySelector('[role="tree"]')!;
    expect(tree.getAttribute('aria-multiselectable')).toBe('true');
    const g = row('g0/l0/n6');
    expect([
      g.getAttribute('aria-level'),
      g.getAttribute('aria-posinset'),
      g.getAttribute('aria-setsize'),
      g.getAttribute('aria-expanded'),
    ]).toEqual(['4', '4', '4', 'false']); // front-most first: n10, n9, n6 (prompt 063)
    expect(row('g0/l0/defs').getAttribute('aria-selected')).toBeNull();
    expect(row('g0/l0/n9').querySelector('.swatch[data-kind="gradient"]')).not.toBeNull();
    expect(row('root').querySelector('.eye')).toBeNull();
    expect(row('g0').querySelector('.eye')!.getAttribute('tabindex')).toBe('-1');
    // roving tab index: one row is reachable with Tab
    expect(el.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
  });

  it('click, Shift-click (range of one kind) and Ctrl-click (toggle) select', async () => {
    const { fixture, row, sel } = await render();
    row('g0/l0/n10').click();
    expect(sel().nodes).toEqual(['n10']);
    row('g0/l0/n6').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(sel().nodes.sort()).toEqual(['n10', 'n6', 'n9']);
    row('g0/l0/n9').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(sel().nodes.sort()).toEqual(['n10', 'n6']);
    row('g1/l0').click();
    expect(sel()).toEqual({ nodes: [], items: [{ kind: 'layer', group: 1, layer: 0 }] });
    await fixture.whenStable();
    expect(row('g1/l0').getAttribute('aria-selected')).toBe('true');
    expect(row('g0/l0/n6').getAttribute('aria-selected')).toBe('false');
  });

  it('keys run the hierarchy actions: arrows, expand / collapse, range, Mod+Space', async () => {
    const { row, key, sel } = await render();
    row('g0/l0').click();
    row('g0/l0').focus();
    await key('ArrowDown');
    expect(document.activeElement).toBe(row('g0/l0/defs'));
    // front-most first (prompt 063): text n10, path n9, group n6
    await key('ArrowDown');
    expect(sel().nodes).toEqual(['n10']);
    await key('ArrowDown');
    await key('ArrowDown');
    expect(sel().nodes).toEqual(['n6']);
    await key('ArrowRight');
    expect(row('g0/l0/n6').getAttribute('aria-expanded')).toBe('true');
    await key('ArrowRight');
    expect(sel().nodes).toEqual(['n8']);
    await key('ArrowDown', { shiftKey: true });
    expect(sel().nodes.sort()).toEqual(['n7', 'n8']);
    await key('ArrowUp', { ctrlKey: true });
    await key('ArrowUp', { ctrlKey: true });
    await key('ArrowUp', { ctrlKey: true });
    expect(sel().nodes.sort()).toEqual(['n7', 'n8']);
    await key(' ', { ctrlKey: true });
    expect(sel().nodes.sort()).toEqual(['n7', 'n8', 'n9']);
    // the focus is on n9 now (Mod+↓ moved it): ← goes to its parent, the layer
    await key('ArrowLeft');
    expect(sel().items).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
    await key('ArrowLeft');
    expect(row('g0/l0').getAttribute('aria-expanded')).toBe('false');
    await key('Home');
    expect(sel().items).toEqual([{ kind: 'root' }]);
  });

  it('eye buttons toggle visibility; Alt with everything inside', async () => {
    const { fixture, row, store } = await render();
    row('g0/l0/n6')
      .querySelector<HTMLButtonElement>('.eye')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    await fixture.whenStable();
    const doc = store.document();
    expect(doc.node({ asset: 'a.svg', id: 'n7' })!.getAttribute('display')).toBe('none');
    expect(row('g0/l0/n6').classList).toContain('dimmed');
    expect(store.selection()).toEqual([]);
    row('g1').querySelector<HTMLButtonElement>('.eye')!.click();
    expect(doc.iconJson.groups![1]['hidden']).toBe(true);
  });

  it('the context menu runs actions on the selection; Delete… asks first', async () => {
    const { fixture, el, row, sel } = await render();
    row('g0/l0/n9').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
    );
    await fixture.whenStable();
    expect(sel().nodes).toEqual(['n9']);
    const items = [...el.querySelectorAll<HTMLElement>('ul.menu:not(.sub) > [role="menuitem"]')];
    const labels = items.map((i) => i.querySelector('.label')!.textContent!.trim());
    // the shared model (prompt 070)
    expect(labels.slice(0, 5)).toEqual(['Cut', 'Copy', 'Paste', 'Duplicate', 'Delete…']);
    expect(labels).toContain('Arrange');
    expect(labels).toContain('Edit SVG…');
    // registered by the window (svg-source-actions, 011) – not in this test
    const editSvg = items.find((i) => i.textContent!.includes('Edit SVG…'))!;
    expect(editSvg.getAttribute('aria-disabled')).toBe('true');
    items.find((i) => i.textContent!.includes('Delete…'))!.click();
    await fixture.whenStable();
    const ask = TestBed.inject(AskService);
    await new Promise((r) => setTimeout(r));
    expect(ask.current()!.message).toContain('removes the node and its children');
    ask.answer('delete');
    await new Promise((r) => setTimeout(r));
    // the next row below (front-most first, prompt 063)
    expect(sel().nodes).toEqual(['n6']);
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('copies and pastes SVG markup through the clipboard facade', async () => {
    const { store, actions } = await render();
    store.select([{ asset: 'a.svg', id: 'n7' }]);
    expect(actions.run('edit.copy')).toBe(true);
    await new Promise((r) => setTimeout(r));
    expect(clipboard.text).toMatch(/^<rect /);
    expect(clipboard.text).not.toContain('data-ai');
    store.selectItems([{ kind: 'layer', group: 1, layer: 0 }]);
    actions.run('edit.paste');
    await new Promise((r) => setTimeout(r));
    expect(store.document().assets.get('b.svg')!.svg!.root.children).toHaveLength(2);
    expect(store.undoLabel()).toBe('Undo Paste');
    // cut = copy + delete in one step
    store.select([{ asset: 'a.svg', id: 'n10' }]);
    actions.run('edit.cut');
    await new Promise((r) => setTimeout(r));
    expect(clipboard.text).toContain('Hello');
    expect(store.undoLabel()).toBe('Undo Cut');
    clipboard.fail = true;
    actions.run('edit.paste');
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(FilesService).notice()).toBe('The clipboard could not be used.');
  });

  it('renders only the visible rows from 500 rows on', async () => {
    const many = Array.from({ length: VIRTUAL_FROM + 100 }, () => '<rect/>').join('');
    const doc = IconDocument.fromDto({
      path: null,
      name: null,
      format: 'bundle',
      iconJson: { groups: [{ layers: [{ 'image-name': 'm.svg' }] }] },
      assets: [
        {
          name: 'm.svg',
          kind: 'svg',
          text: `<svg xmlns="http://www.w3.org/2000/svg">${many}</svg>`,
        },
      ],
      warnings: [],
    });
    const { el, fixture } = await render(doc);
    const rendered = el.querySelectorAll('[role="treeitem"]').length;
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(200);
    const sheet = el.querySelector<HTMLElement>('.sheet')!;
    expect(parseFloat(sheet.style.height)).toBe((VIRTUAL_FROM + 103) * 24);
    // scrolled far away: the row with tab index 0 stays in the DOM (prompt 031)
    const tabbable = () => el.querySelectorAll('[role="treeitem"][tabindex="0"]');
    expect(tabbable().length).toBe(1);
    const first = tabbable()[0].getAttribute('data-row');
    const list = el.querySelector<HTMLElement>('[role="tree"]')!;
    list.scrollTop = 400 * 24;
    list.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(tabbable().length).toBe(1);
    expect(tabbable()[0].getAttribute('data-row')).toBe(first);
    expect(el.querySelectorAll('[role="treeitem"]').length).toBeLessThan(200);
    // the window really moved: the other rendered rows are far down
    const indices = [...el.querySelectorAll('[role="treeitem"]:not([tabindex="0"])')].map((r) =>
      Number(r.getAttribute('data-index')),
    );
    expect(Math.min(...indices)).toBeGreaterThan(300);
  });

  it('Select All leaves locked nodes out (guides are locked, prompt 066)', async () => {
    const { store, actions } = await render();
    store.document().node({ asset: 'a.svg', id: 'n9' })!.setAttribute('data-locked', 'true');
    store.select([{ asset: 'a.svg', id: 'n10' }]);
    actions.run('edit.selectAll');
    const ids = store.selection().map((r) => r.id);
    expect(ids).toContain('n10');
    expect(ids).not.toContain('n9');
  });
});
