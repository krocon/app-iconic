import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { ActionService } from '../../core/actions/action.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { deniedReason } from '../mcp/mcp-policy';
import { SymbolLibraryService, parseTags } from './symbol-library.service';
import { registerSymbolActions } from './symbol-actions';
import { SymbolService } from './symbol.service';

const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M5 0l2 4h3l-2 3 1 3-4-2-4 2 1-3-2-3h3z" fill="#ff8800"/></svg>';

const wait = () => new Promise((r) => setTimeout(r));

describe('SymbolLibraryService (design 084 E5–E12)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let library: SymbolLibraryService;
  let store: DocumentStore;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    library = TestBed.inject(SymbolLibraryService);
  });

  it('saves the selection, lists it as "My Symbols" and inserts it again', async () => {
    vi.spyOn(library, 'captureSelection').mockReturnValue(STAR);
    const r = await library.saveSelection(' Star ', parseTags('Shape, favourite ,'));
    expect(r).toMatchObject({
      ok: true,
      symbol: { id: 'star', name: 'Star', tags: ['shape', 'favourite'] },
    });
    expect(TestBed.inject(FilesService).notice()).toBe('Saved “Star” in My Symbols.');
    expect(library.mine.search('favourite', 10).items.map((s) => s.id)).toEqual(['star']);
    const svg = library.mine.toSvg('star')!;
    expect(svg.group.children![0].attrs['fill']).toBe('#ff8800');

    const symbols = TestBed.inject(SymbolService);
    expect(await symbols.addFromArgs({ set: 'mine', id: 'star', size: 100 })).toBe(true);
    const g = store.document().node(store.selection()[0])!;
    expect(g.localName).toBe('g');
    expect(g.querySelector('path')!.getAttribute('fill')).toBe('#ff8800');
    await wait();
    expect(library.recent()).toEqual([{ set: 'mine', id: 'star' }]);
  });

  it('refuses an empty selection and shows the backend errors as text', async () => {
    expect(await library.saveSelection('x', [])).toEqual({
      ok: false,
      error: 'Select shapes to save them as a symbol.',
    });
    vi.spyOn(library, 'captureSelection').mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    );
    const r = await library.saveSelection('x', []);
    expect(r.ok).toBe(false);
  });

  it('renames, deletes and finds own symbols; the AI may not delete', async () => {
    await backend.symbols.save('Moon', ['night'], STAR);
    await library.refresh();
    const actions = TestBed.inject(ActionService);
    registerSymbolActions(actions, library, TestBed.inject(FilesService));
    expect(await actions.runAsync('symbols.rename', { id: 'moon', name: 'Half Moon' })).toBe(true);
    expect(backend.symbols.symbols.get('moon')).toMatchObject({
      name: 'Half Moon',
      tags: ['night'],
    });
    const found = await TestBed.inject(SymbolService).find('half', 'mine', 10);
    expect(found).toEqual([{ id: 'moon', name: 'Half Moon', tags: ['night'], set: 'mine' }]);
    expect(deniedReason('symbols.delete')).not.toBeNull();
    expect(deniedReason('symbols.import')).not.toBeNull();
    expect(deniedReason('symbols.save', { name: 'x' })).toBeNull();
    expect(await actions.runAsync('symbols.delete', { id: 'moon' })).toBe(true);
    expect(library.mine.all()).toEqual([]);
  });

  it('imports and exports a folder through the dialog', async () => {
    backend.symbols.folders.set('/browser/symbols', [
      { name: 'a', svg: STAR },
      { name: 'evil', svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>' },
    ]);
    expect(await library.importFolder()).toBe(true);
    expect(TestBed.inject(FilesService).notice()).toBe('1 symbol imported, 1 file skipped.');
    expect(await library.exportFolder()).toBe(true);
    expect(TestBed.inject(FilesService).notice()).toBe(
      '1 symbol exported to /browser/symbols/AppIconic Symbols.',
    );
    backend.symbols.picked = null;
    expect(await library.importFolder()).toBe(false);
  });

  it('find: an empty query lists the recently used symbols', async () => {
    const symbols = TestBed.inject(SymbolService);
    await backend.symbols.recordUse({ set: 'lucide', id: 'heart' });
    await backend.symbols.recordUse({ set: 'lucide', id: 'nope' });
    const recent = await symbols.find('', undefined, 10);
    expect(recent.map((s) => `${s.set}:${s.id}`)).toEqual(['lucide:heart']);
    const all = await symbols.find('heart', undefined, 50);
    expect(new Set(all.map((s) => s.set))).toEqual(new Set(['lucide', 'tabler', 'phosphor']));
  });
});
