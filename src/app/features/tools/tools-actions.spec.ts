import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { AddService } from '../commands/add.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { LucideProvider } from '../symbols/lucide-provider';
import { placeSymbol, SymbolService } from '../symbols/symbol.service';
import { FreehandService, parsePoints } from './freehand.service';
import { TextPathService } from './text-path.service';
import { registerToolActions } from './tools-actions';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('tool actions (design 013)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;
  let actions: ActionService;
  let freehand: FreehandService;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    actions = TestBed.inject(ActionService);
    freehand = TestBed.inject(FreehandService);
    registerToolActions(
      actions,
      TestBed.inject(AddService),
      freehand,
      TestBed.inject(TextPathService),
      TestBed.inject(SymbolService),
    );
  });

  const node = () => store.document().node(store.selection()[0])!;
  const notice = () => TestBed.inject(FilesService).notice();

  it('add.freehand without arguments switches the tool, C toggles closed only while on', () => {
    expect(actions.enabled('freehand.toggleClosed')).toBe(false);
    actions.run('add.freehand');
    expect(freehand.tool.active()).toBe(true);
    expect(actions.enabled('freehand.toggleClosed')).toBe(true);
    actions.run('freehand.toggleClosed');
    expect(freehand.tool.closed()).toBe(true);
    actions.run('add.freehand');
    expect(freehand.tool.active()).toBe(false);
  });

  it('add.freehand with points adds one stroked path (one step, as JSON the same)', async () => {
    const points = Array.from({ length: 50 }, (_, i) => [100 + i * 4, 300 + Math.sin(i / 5) * 40]);
    actions.run('add.freehand', { points, strokeWidth: 12 });
    await flush();
    const el = node();
    expect(el.localName).toBe('path');
    expect(el.getAttribute('d')).toMatch(/^M 100 300 C/);
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.getAttribute('stroke')).toBe('#000000');
    expect(el.getAttribute('stroke-width')).toBe('12');
    expect(el.getAttribute('stroke-linecap')).toBe('round');
    expect(store.undoLabel()).toBe('Undo Add Freehand');
    const json = store.lastCommandJson()!;
    const d = el.getAttribute('d');
    store.undo();
    store.runCommand(JSON.parse(JSON.stringify(json)));
    const root = store.document().node({ asset: 'a.svg', id: 'n1' })!;
    expect(root.lastElementChild!.getAttribute('d')).toBe(d);
  });

  it('a closed stroke from the canvas ends with Z', async () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      x: 512 + 100 * Math.cos((i / 40) * 2 * Math.PI),
      y: 512 + 100 * Math.sin((i / 40) * 2 * Math.PI),
    }));
    expect(await freehand.insertStroke({ points: pts, closed: true })).toBe(true);
    expect(node().getAttribute('d')!.endsWith('Z')).toBe(true);
  });

  it('malformed points are refused with a notice', async () => {
    expect(parsePoints([[1, 2]])).toBeNull();
    expect(parsePoints([[1, 2], [3]])).toBeNull();
    expect(
      parsePoints([
        [1, 2],
        ['a', 3],
      ]),
    ).toBeNull();
    expect(
      parsePoints([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    actions.run('add.freehand', { points: [[0, 0]] });
    await flush();
    expect(notice()).toBe('The freehand path could not be added.');
  });

  it('add.textToPath without text opens the dialog, with text adds a centred path', async () => {
    actions.run('add.textToPath');
    expect(TestBed.inject(DialogService).open()).toBe('textPath');
    TestBed.inject(DialogService).close();
    actions.run('add.textToPath', { text: 'Hi', font: 'fake serif', size: 100, x: 400, y: 300 });
    await flush();
    await flush();
    const el = node();
    expect(el.localName).toBe('path');
    expect(el.getAttribute('fill')).toBe('#000000');
    expect(backend.fonts.calls.at(-1)).toEqual({
      text: 'Hi',
      fontId: 'FakeSerif-Regular',
      size: 100,
      letterSpacing: 0,
    });
    // fake: two boxes of 54 × 70 with 6 between → bounds 114 × 70 around (400, 300)
    expect(el.getAttribute('d')!.startsWith('M343 265 L')).toBe(true);
    expect(store.undoLabel()).toBe('Undo Add Text Path');
  });

  it('text to path errors and unknown fonts become notices, nothing is added', async () => {
    const before = store.document().snapshot();
    actions.run('add.textToPath', { text: 'Hi 😀' });
    await flush();
    await flush();
    expect(notice()).toContain('no shapes for some characters');
    actions.run('add.textToPath', { text: 'Hi', font: 'Comic Sans' });
    await flush();
    expect(notice()).toBe('The font is not installed.');
    expect(store.document().snapshot()).toBe(before);
  });

  it('add.symbol without id opens the picker, with id adds the scaled group', async () => {
    await TestBed.inject(SymbolService).providers[0].load();
    actions.run('add.symbol');
    expect(TestBed.inject(DialogService).open()).toBe('symbolPicker');
    TestBed.inject(DialogService).close();
    actions.run('add.symbol', { id: 'heart', size: 240, weight: 1.5, x: 500, y: 400 });
    for (let i = 0; i < 20 && store.selection().length === 0; i++) await flush();
    const el = node();
    expect(el.localName).toBe('g');
    expect(el.getAttribute('transform')).toBe('translate(380 280) scale(10)');
    expect(el.getAttribute('stroke-width')).toBe('1.5');
    expect(Array.from(el.children).every((c) => c.localName === 'path')).toBe(true);
    expect(store.undoLabel()).toBe('Undo Add Symbol');
  });

  it('an unknown symbol is a notice, an unknown set is refused by the arguments (084)', async () => {
    await TestBed.inject(SymbolService).providers[0].load();
    actions.run('add.symbol', { id: 'no-such-symbol' });
    for (let i = 0; i < 20 && !notice(); i++) await flush();
    expect(notice()).toBe('There is no such symbol.');
    TestBed.inject(FilesService).notice.set(null);
    // the sets are an enum of the arguments: the AI learns them from list_actions
    expect(actions.run('add.symbol', { id: 'heart', set: 'sf-symbols' })).toBe(false);
    await flush();
    expect(notice()).toBeNull();
  });
});

describe('placeSymbol', () => {
  it('scales the 24 box to the size around the centre and recolours black', async () => {
    const p = new LucideProvider(() =>
      Promise.resolve({
        nodes: { dot: [['circle', { cx: '12', cy: '12', r: '2', fill: 'currentColor' }]] },
        tags: {},
      }),
    );
    await p.load();
    const g = placeSymbol(p.toSvg('dot')!, {
      size: 48,
      center: { x: 100, y: 50 },
      stroke: '#ff0000',
    });
    expect(g.attrs['transform']).toBe('translate(76 26) scale(2)');
    expect(g.attrs['stroke']).toBe('#ff0000');
    expect(g.children![0].attrs['fill']).toBe('#ff0000');
  });
});
