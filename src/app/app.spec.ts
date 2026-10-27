import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { fakeBackend } from '../testing/providers';
import { FakeIconFileApi } from '../testing/fake-icon-file-api';
import { ActionService } from './core/actions/action.service';
import { OS } from './core/actions/platform';

describe('App', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
  });

  /** Opens a menu of the HTML menu bar and chooses an item (design 005 E8). */
  async function menu(
    fixture: { whenStable(): Promise<unknown> },
    el: HTMLElement,
    top: string,
    item: string,
  ) {
    [...el.querySelectorAll<HTMLButtonElement>('[role="menubar"] > .top > button')]
      .find((b) => b.textContent?.trim() === top)!
      .click();
    await fixture.whenStable();
    const li = [...el.querySelectorAll<HTMLElement>('[role="menu"] li[tabindex]')].find(
      (x) => x.querySelector('.label')?.textContent?.trim() === item,
    );
    expect(li, item).toBeDefined();
    li!.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  }

  function key(k: string, init: KeyboardEventInit = {}) {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  }

  async function app(start: string | null = null) {
    backend.window.start = start;
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the three panels and the canvas', async () => {
    const { el } = await app();
    const regions = [...el.querySelectorAll('[role="region"]')].map((r) =>
      r.getAttribute('aria-label'),
    );
    expect(regions).toEqual(['Commands', 'Hierarchy', 'Properties']);
    expect(el.querySelectorAll('app-canvas-view .guides circle')).toHaveLength(3);
    expect(el.querySelector('[data-testid="doc-title"]')?.textContent).toContain('Untitled');
  });

  it('opens the About dialog (Help menu) with the version from the backend', async () => {
    const { fixture, el } = await app();
    await menu(fixture, el, 'Help', 'About AppIconic');
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('0.0.0-test');
  });

  it('shows the tree of the open document and stacks the layers (first on top)', async () => {
    const { el } = await app(FakeIconFileApi.CAMSCANNER);
    const rows = [...el.querySelectorAll('app-hierarchy-tree [role="treeitem"]')].map((r) =>
      r.querySelector('.label')!.textContent!.trim(),
    );
    expect(rows.slice(0, 3)).toEqual(['Icon', 'Group 1', 'logo-scanner 3']);
    const layers = [...el.querySelectorAll<HTMLElement>('app-canvas-view .layer')];
    // first group on top = last in paint order (design 004 E3)
    expect(layers.map((l) => l.dataset['asset'])).toEqual([
      'logo-scanner-2 2.svg',
      'logo-scanner 3.svg',
    ]);
    expect(layers[1].shadowRoot!.querySelector('svg polygon')).not.toBeNull();
  });

  it('undo and redo buttons follow the document', async () => {
    const { fixture, el } = await app(FakeIconFileApi.CAMSCANNER);
    const undo = el.querySelector<HTMLButtonElement>('button.undo')!;
    expect(undo.disabled).toBe(true);
    backend.files.svgFiles.set('/a.svg', {
      name: 'a.svg',
      text: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    backend.files.picks.push('/a.svg');
    await menu(fixture, el, 'File', 'Import SVG…');
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(undo.disabled).toBe(false);
    expect(undo.getAttribute('aria-label')).toBe('Undo Import SVG');
    expect(el.querySelector('[data-testid="doc-title"]')?.textContent).toContain('Edited');
    undo.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button.redo')!.disabled).toBe(false);
    expect(el.querySelectorAll('app-canvas-view .layer')).toHaveLength(2);
  });

  it('has the menus File, Edit, View, Add, Arrange, Help with the shortcuts of this OS', async () => {
    const { fixture, el } = await app();
    const tops = [...el.querySelectorAll('[role="menubar"] > .top > button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(tops).toEqual(['File', 'Edit', 'View', 'Add', 'Arrange', 'Help']);
    el.querySelector<HTMLButtonElement>('[role="menubar"] > .top > button')!.click();
    await fixture.whenStable();
    const save = [...el.querySelectorAll('[role="menu"] li[tabindex]')].find(
      (li) => li.querySelector('.label')?.textContent === 'Save',
    )!;
    expect(save.querySelector('kbd')?.textContent).toBe('Ctrl+S');
    // Export (prompt 012) is there and enabled with a document
    const exportPng = [...el.querySelectorAll('[role="menu"] li[tabindex]')].find(
      (li) => li.querySelector('.label')?.textContent === 'Export PNG…',
    )!;
    expect(exportPng.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('Ctrl+1/2/3 hide and show the side panels; the View menu has check items', async () => {
    const { fixture, el } = await app();
    const regions = () =>
      [...el.querySelectorAll('[role="region"]')].map((r) => r.getAttribute('aria-label'));
    key('2', { ctrlKey: true });
    await fixture.whenStable();
    expect(regions()).toEqual(['Commands', 'Properties']);
    key('1', { ctrlKey: true });
    key('3', { ctrlKey: true });
    await fixture.whenStable();
    expect(regions()).toEqual([]);
    expect(TestBed.inject(ActionService).checked('view.hierarchy')).toBe(false);
    await menu(fixture, el, 'View', 'Hierarchy');
    expect(regions()).toEqual(['Hierarchy']);
  });

  it('the command palette filters and runs an action', async () => {
    const { fixture, el } = await app();
    key('P', { ctrlKey: true, shiftKey: true });
    await fixture.whenStable();
    // the command sidebar has a combobox, too (design 008 E10): the palette's is in the dialog
    const input = el.querySelector<HTMLInputElement>('[role="dialog"] [role="combobox"]')!;
    expect(input).not.toBeNull();
    const options = () =>
      [...el.querySelectorAll('[role="dialog"] [role="option"]')].map((o) => o.textContent);
    expect(options().some((o) => o?.includes('Zoom In'))).toBe(true);
    input.value = 'cross cur';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(options()).toEqual(['Cross Cursor']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    // the cross cursor is on by default (design 015 E9): the palette turned it off
    expect(el.querySelector('.viewport')!.classList).not.toContain('cross');
  });

  it('lists the shortcuts by menu (Ctrl+/)', async () => {
    const { fixture, el } = await app();
    key('/', { ctrlKey: true });
    await fixture.whenStable();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('h2')?.textContent).toBe('Keyboard Shortcuts');
    const heads = [...dialog.querySelectorAll('th')].map((h) => h.textContent);
    expect(heads.slice(0, 3)).toEqual(['File', 'Edit', 'View']);
    expect(dialog.textContent).toContain('Ctrl+Shift+N');
  });

  it('runs the start action of a window opened from the menu without a window (macOS)', async () => {
    backend.window.action = 'app.about';
    const { el } = await app();
    expect(el.querySelector('[role="dialog"] h2')?.textContent).toBe('About AppIconic');
  });
});
