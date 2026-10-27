import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { commandFromJson } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { groups, layers } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { registerAddActions } from './add-actions';
import { AddService } from './add.service';

const a = (id: string) => ({ asset: 'a.svg', id });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AddService (design 008)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;
  let add: AddService;
  let actions: ActionService;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    add = TestBed.inject(AddService);
    actions = TestBed.inject(ActionService);
    registerAddActions(actions, add);
  });

  const node = () => store.document().node(store.selection()[0])!;

  it('adds a circle at the end of the first layer, selected, one undo step', async () => {
    const before = store.document().snapshot();
    expect(await add.addShape('circle')).toBe(true);
    expect(store.selection()).toHaveLength(1);
    const el = node();
    expect(el.localName).toBe('circle');
    expect(el.parentElement!.getAttribute('data-ai-id')).toBe('n1');
    // no viewport in tests: the artboard's centre
    expect([el.getAttribute('cx'), el.getAttribute('cy'), el.getAttribute('r')]).toEqual([
      '512',
      '512',
      '128',
    ]);
    expect(store.undoLabel()).toBe('Undo Add Circle');
    const json = store.lastCommandJson()!;
    expect(json).toMatchObject({ type: 'composite', label: 'addCircle' });
    store.undo();
    expect(store.document().snapshot()).toBe(before);
    expect(store.selection()).toEqual([]);
    // the step as JSON makes the same change
    store.runCommand(JSON.parse(JSON.stringify(json)));
    expect(store.document().node(a('n1'))!.lastElementChild!.localName).toBe('circle');
  });

  it('goes into a selected container and after a selected shape', async () => {
    store.select([a('n6')]);
    await add.addShape('rect');
    expect(node().parentElement!.getAttribute('data-ai-id')).toBe('n6');
    store.select([a('n7')]);
    await add.addShape('line');
    const el = node();
    expect(el.previousElementSibling!.getAttribute('data-ai-id')).toBe('n7');
  });

  it('runs as an action with serialisable arguments (the AI path)', async () => {
    expect(
      actions.run('add.circle', { cx: 10, cy: 20, r: 5, fill: 'red', parent: a('n6'), index: 0 }),
    ).toBe(true);
    await flush();
    const el = node();
    expect(el.parentElement!.firstElementChild).toBe(el);
    expect(el.getAttribute('fill')).toBe('red');
    expect(el.getAttribute('cx')).toBe('10');
    expect(actions.run('add.circle', { cx: 'x' })).toBe(false);
    // refused attributes / a missing parent change nothing
    const before = store.document().snapshot();
    actions.run('add.rect', { attributes: { onload: 'x()' } });
    actions.run('add.rect', { parent: { asset: 'a.svg', id: 'n999' } });
    await flush();
    expect(store.document().snapshot()).toBe(before);
    expect(
      actions.describe().find((x) => x.id === 'add.circle')!.args!.properties['r'],
    ).toBeTruthy();
    expect(actions.enabled('add.freehand')).toBe(false);
  });

  it('uses the canvas group context', async () => {
    TestBed.inject(CanvasEditStore).context.set(a('n6'));
    await add.addShape('ellipse');
    expect(node().parentElement!.getAttribute('data-ai-id')).toBe('n6');
  });

  it('adds an icon group and puts the next shape into its layer', async () => {
    store.select([{ asset: 'b.svg', id: 'n12' }]);
    expect(await add.addIconGroup()).toBe(true);
    const gs = groups(store.document().iconJson);
    expect(gs).toHaveLength(3);
    expect(layers(gs[2])[0]['image-name']).toBe('layer-3.svg');
    expect(store.items()).toEqual([{ kind: 'layer', group: 2, layer: 0 }]);
    await add.addShape('text');
    expect(store.selection()[0].asset).toBe('layer-3.svg');
    expect(node().textContent).toBe('Text');
  });

  it('creates a group when there is no layer, a document when there is none', async () => {
    const doc = store.document();
    doc.iconJson = { groups: [] };
    await add.addShape('polygon');
    expect(groups(doc.iconJson)).toHaveLength(1);
    expect(store.selection()[0].asset).toBe('layer-1.svg');
    expect(store.undoLabel()).toBe('Undo Add Polygon');
    store.undo();
    expect(doc.assets.has('layer-1.svg')).toBe(false);

    TestBed.inject(FilesService).store.set(null);
    await add.addShape('circle');
    const fresh = TestBed.inject(FilesService).store()!;
    expect(fresh).not.toBe(store);
    expect(fresh.document().node(fresh.selection()[0])!.localName).toBe('circle');
  });

  it('adds an image from the dialog, fitted and centred', async () => {
    backend.files.imageFiles.set('/p.png', {
      name: 'p.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      width: 2048,
      height: 1024,
    });
    backend.files.picks.push('/p.png');
    expect(await add.addImage()).toBe(true);
    const el = node();
    expect(el.localName).toBe('image');
    expect(['x', 'y', 'width', 'height'].map((k) => el.getAttribute(k))).toEqual([
      '256',
      '384',
      '512',
      '256',
    ]);
    expect(el.getAttribute('href')).toMatch(/^data:image\/png/);
    // cancelled, unreadable
    expect(await add.addImage()).toBe(false);
    backend.files.picks.push('/none.png');
    expect(await add.addImage()).toBe(false);
    expect(TestBed.inject(FilesService).notice()).toContain('could not be added');
    // the AI: data URLs only
    expect(await add.addImage({ href: 'https://x/y.png' })).toBe(false);
    const svg = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"/>')}`;
    expect(await add.addImage({ href: svg })).toBe(true);
    expect(node().getAttribute('width')).toBe('64');
  });

  it('appends a snippet; the action without markup opens the dialog', async () => {
    expect(await add.addSnippet('<rect id="r"/><circle/>')).toBeNull();
    expect(store.selection().map((r) => store.document().node(r)!.localName)).toEqual([
      'rect',
      'circle',
    ]);
    expect(store.undoLabel()).toBe('Undo Add SVG Snippet');
    expect(await add.addSnippet('<nope')).toBe('invalid');
    actions.run('add.svgSnippet');
    expect(TestBed.inject(DialogService).open()).toBe('svgSnippet');
    // a command that inserts a node with an image of 20 MiB passes the registry
    const big = 'A'.repeat(20 << 20);
    expect(() =>
      commandFromJson({
        type: 'insertNode',
        parent: a('n1'),
        markup: `<image href="data:image/png;base64,${big}"/>`,
      }),
    ).not.toThrow();
  });
});
