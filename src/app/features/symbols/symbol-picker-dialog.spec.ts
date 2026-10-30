import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { SymbolPickerDialog } from './symbol-picker-dialog';
import { SymbolService } from './symbol.service';
import { SymbolLibraryApi } from '../../core/symbols/symbol-library-api';
import { FakeSymbolLibraryApi } from '../../../testing/fake-symbol-library-api';

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('SymbolPickerDialog (design 013 E20)', () => {
  let store: DocumentStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    await TestBed.inject(SymbolService).providers[0].load();
    TestBed.inject(DialogService).show('symbolPicker');
  });

  async function render() {
    const fixture = TestBed.createComponent(SymbolPickerDialog);
    document.body.append(fixture.nativeElement);
    await wait();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const search = el.querySelector<HTMLInputElement>('[data-testid="symbol-search"]')!;
    const tiles = () => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
    const key = async (k: string) => {
      search.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
    };
    const choose = async (set: string) => {
      const select = el.querySelector<HTMLSelectElement>('[data-testid="symbol-set"]')!;
      select.value = set;
      select.dispatchEvent(new Event('change'));
      // the sets load lazily (big chunks): wait until the grid shows them
      for (let i = 0; i < 300; i++) {
        await wait(10);
        await fixture.whenStable();
        if (i > 3 && !el.textContent!.includes('Loading symbols')) break;
      }
    };
    const type = async (q: string) => {
      search.value = q;
      search.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, search, tiles, key, type, choose };
  }

  it('searches, moves with the keyboard and shows the licence', async () => {
    const { el, search, tiles, key, type } = await render();
    expect(tiles().length).toBe(240);
    expect(el.textContent).toContain('Lucide · ISC License');
    await type('heart');
    expect(tiles()[0].getAttribute('data-symbol')).toBe('heart');
    expect(tiles()[0].querySelector('path')).not.toBeNull();
    expect(search.getAttribute('aria-activedescendant')).toBe('symbol-0');
    await key('ArrowDown');
    await key('Home');
    await key('End');
    expect(search.getAttribute('aria-activedescendant')).toBe(`symbol-${tiles().length - 1}`);
    await type('zzzz-nothing');
    expect(el.textContent).toContain('No symbol matches.');
  });

  it('Enter adds the active symbol at the chosen size and closes', async () => {
    const { el, key, type, fixture } = await render();
    const size = el.querySelector<HTMLInputElement>('[data-testid="symbol-size"]')!;
    size.value = '96';
    size.dispatchEvent(new Event('change'));
    await type('heart');
    await key('Enter');
    await wait();
    await fixture.whenStable();
    const g = store.document().node(store.selection()[0])!;
    expect(g.localName).toBe('g');
    expect(g.getAttribute('transform')).toBe('translate(464 464) scale(4)');
    expect(TestBed.inject(DialogService).open()).toBeNull();
    expect(TestBed.inject(SymbolService).last()).toMatchObject({ query: 'heart', size: 96 });
  });

  it('all sets: one search over every set, the licence of the active symbol (084)', async () => {
    const { el, tiles, type, choose } = await render();
    await choose('all');
    await type('heart');
    const sets = new Set(tiles().map((t) => t.getAttribute('data-set')));
    expect(sets).toEqual(new Set(['lucide', 'tabler', 'phosphor']));
    expect(tiles()[0].getAttribute('aria-label')).toMatch(/^heart · /);
    expect(el.textContent).toMatch(/(Lucide · ISC|Tabler · MIT|Phosphor · MIT) License/);
  });

  it('recently used and My Symbols: rename and delete inline (084)', async () => {
    const api = TestBed.inject(SymbolLibraryApi) as FakeSymbolLibraryApi;
    await api.save(
      'Star',
      ['shape'],
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#ff0000"/></svg>',
    );
    await api.recordUse({ set: 'mine', id: 'star' });
    const { el, tiles, choose, fixture } = await render();
    await choose('recent');
    expect(tiles().map((t) => t.getAttribute('data-symbol'))).toEqual(['star']);
    await choose('mine');
    expect(tiles().length).toBe(1);
    // the own colours in the preview
    expect(tiles()[0].querySelector('path')!.getAttribute('fill')).toBe('#ff0000');
    expect(el.textContent).toContain('Your own symbols');
    const click = async (id: string) => {
      el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click();
      for (let i = 0; i < 4; i++) {
        await wait();
        await fixture.whenStable();
      }
    };
    await click('my-symbol-rename');
    const name = el.querySelector<HTMLInputElement>('[data-testid="my-symbol-name"]')!;
    name.value = 'Red Square';
    name.dispatchEvent(new Event('input'));
    await click('my-symbol-save');
    expect(api.symbols.get('star')!.name).toBe('Red Square');
    expect(tiles()[0].getAttribute('aria-label')).toBe('Red Square');
    await click('my-symbol-delete');
    expect(el.textContent).toContain('Delete “Red Square” for good?');
    await click('my-symbol-confirm');
    expect(api.symbols.size).toBe(0);
    expect(el.textContent).toContain('No own symbols yet');
  });
});
