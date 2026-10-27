import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { SymbolPickerDialog } from './symbol-picker-dialog';
import { SymbolService } from './symbol.service';

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
    const type = async (q: string) => {
      search.value = q;
      search.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, search, tiles, key, type };
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
});
