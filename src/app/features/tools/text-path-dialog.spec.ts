import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { PREVIEW_DELAY, TextPathDialog } from './text-path-dialog';
import { TextPathService } from './text-path.service';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TextPathDialog (design 013 E13)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    TestBed.inject(DialogService).show('textPath');
  });

  async function render() {
    const fixture = TestBed.createComponent(TextPathDialog);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends Element>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
    const type = async (v: string) => {
      const input = q<HTMLInputElement>('text-path-text');
      input.value = v;
      input.dispatchEvent(new Event('input'));
      await wait(PREVIEW_DELAY + 30);
      await fixture.whenStable();
    };
    return { fixture, el, q, type };
  }

  it('lists the fonts with the default chosen and previews the real outlines', async () => {
    const { q, type } = await render();
    const family = q<HTMLSelectElement>('text-path-family');
    expect(Array.from(family.options).map((o) => o.value)).toEqual(['Fake Sans', 'Fake Serif']);
    expect(family.value).toBe('Fake Sans');
    expect(q<HTMLSelectElement>('text-path-style').value).toBe('FakeSans-Regular');
    expect(q<HTMLButtonElement>('text-path-add').disabled).toBe(true);
    await type('AB');
    expect(q('text-path-preview').querySelector('path')!.getAttribute('d')).toContain('M0 -179.2');
    expect(q<HTMLButtonElement>('text-path-add').disabled).toBe(false);
    expect(backend.fonts.listCalls).toBe(1);
  });

  it('shows the error text (never Rust’s message) and blocks Add', async () => {
    const { q, type } = await render();
    await type('Hi 😀');
    expect(q('text-path-error').textContent).toContain('no shapes for some characters');
    expect(q<HTMLButtonElement>('text-path-add').disabled).toBe(true);
  });

  it('a family keeps the style name; Add inserts one path and remembers the choice', async () => {
    const { q, type, fixture } = await render();
    const style = q<HTMLSelectElement>('text-path-style');
    style.value = 'FakeSans-Bold';
    style.dispatchEvent(new Event('change'));
    await type('X');
    expect(backend.fonts.calls.at(-1)!.fontId).toBe('FakeSans-Bold');
    q<HTMLButtonElement>('text-path-add').click();
    await wait(0);
    await fixture.whenStable();
    expect(store.document().node(store.selection()[0])!.localName).toBe('path');
    expect(TestBed.inject(DialogService).open()).toBeNull();
    expect(TestBed.inject(TextPathService).last()).toMatchObject({
      text: 'X',
      fontId: 'FakeSans-Bold',
    });
  });
});
