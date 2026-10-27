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

  it('lists every add action with shortcut; later ones disabled', async () => {
    const { options, el } = await render();
    expect(options()).toHaveLength(15);
    const image = options().find((o) => o.dataset['action'] === 'add.image')!;
    expect(image.textContent).toContain('Ctrl+I');
    const free = options().find((o) => o.dataset['action'] === 'add.freehand')!;
    expect(free.getAttribute('aria-disabled')).toBe('true');
    free.click();
    expect(store.selection()).toEqual([]);
    expect(el.textContent).toContain('Shapes');
    expect(el.textContent).not.toContain('Coming with the next prompts');
  });

  it('filters, moves with the keys and runs with Enter', async () => {
    const { options, input, key, type } = await render();
    await type('poly');
    expect(options().map((o) => o.dataset['action'])).toEqual(['add.polyline', 'add.polygon']);
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-1');
    await key('Enter');
    expect(store.document().node(store.selection()[0])!.localName).toBe('polygon');
    await type('zzz');
    expect(options()).toHaveLength(0);
    await key('Escape');
    expect(options()).toHaveLength(15);
    await key('End');
    expect(input.getAttribute('aria-activedescendant')).toBe('command-14');
  });

  it('runs a click', async () => {
    const { options } = await render();
    options()
      .find((o) => o.dataset['action'] === 'add.circle')!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.document().node(store.selection()[0])!.localName).toBe('circle');
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
