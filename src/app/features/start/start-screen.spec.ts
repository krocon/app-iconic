import { TestBed } from '@angular/core/testing';
import { App } from '../../app';
import { fakeBackend } from '../../../testing/providers';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { FilesService } from '../files/files.service';
import { GUIDE_ATTR } from '../guides/guide-attr';
import { ThumbnailService } from './thumbnail.service';

/** The start screen in the window (design 082 E1–E3, E8). */
describe('StartScreen', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
  });

  async function settle(fixture: { whenStable(): Promise<unknown> }) {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r));
    }
  }

  async function app(start: string | null = null) {
    backend.window.start = start;
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const screen = (el: HTMLElement) => el.querySelector('[data-testid="start-screen"]');
  const title = (el: HTMLElement) =>
    el.querySelector('[data-testid="doc-title"]')?.textContent?.trim();

  function key(k: string, init: KeyboardEventInit = {}) {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  }

  it('a window without a file shows the start screen instead of an empty document', async () => {
    const { el } = await app();
    expect(screen(el)).not.toBeNull();
    expect(TestBed.inject(FilesService).store()).toBeNull();
    expect(el.querySelector('.workspace')!.classList).toContain('covered');
    expect(el.querySelector('[data-testid="start-no-recent"]')).not.toBeNull();
    // no document behind it: no way "back"
    expect(el.querySelector('[data-testid="start-close"]')).toBeNull();
  });

  it('a start file (argv, Finder – 030) opens straight away, no start screen', async () => {
    const { el } = await app(FakeIconFileApi.CAMSCANNER);
    expect(screen(el)).toBeNull();
    expect(title(el)).toContain('camscanner.icon');
  });

  it('a window opened for an action (Open Recent) starts without the start screen', async () => {
    backend.window.action = 'app.about';
    const { el } = await app();
    expect(screen(el)).toBeNull();
    expect(TestBed.inject(FilesService).store()).not.toBeNull();
  });

  it('the setting "empty document" starts as before', async () => {
    backend.settings.stored = { ...backend.settings.stored, startup: 'emptyDocument' };
    const { el } = await app();
    expect(screen(el)).toBeNull();
    expect(title(el)).toContain('Untitled');
  });

  it('templates form a grid: arrows move the one tab stop, Enter opens an untitled document', async () => {
    const { fixture, el } = await app();
    const grid = el.querySelector('[data-testid="start-templates"]')!;
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('aria-labelledby')).toBe('start-templates');
    const cells = [...grid.querySelectorAll<HTMLElement>('[role="row"] > [role="gridcell"]')];
    expect(cells.map((c) => c.dataset['template'])).toEqual([
      'ios',
      'macos',
      'watchos',
      'lightDark',
    ]);
    // no recent files: the focus is on the first template
    expect(document.activeElement).toBe(cells[0]);
    expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(cells[0].getAttribute('aria-label')).toContain('iOS App Icon');
    key('ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(cells[1]);
    expect(cells[1].tabIndex).toBe(0);
    expect(cells[0].tabIndex).toBe(-1);
    key('End');
    await fixture.whenStable();
    expect(document.activeElement).toBe(cells[3]);
    key('Home');
    await fixture.whenStable();
    key('Enter');
    await settle(fixture);
    expect(screen(el)).toBeNull();
    const store = TestBed.inject(FilesService).store()!;
    expect(title(el)).toContain('Untitled');
    expect(store.pristine()).toBe(true);
    expect(store.document().path).toBeNull();
    // the keylines of 056 are in the document
    const guides = [...store.document().assets.values()].flatMap((a) =>
      Array.from(a.svg!.root.querySelectorAll(`[${GUIDE_ATTR}]`)),
    );
    expect(guides.length).toBeGreaterThan(0);
  });

  it('File › New from Template… shows the templates over the document; Esc goes back', async () => {
    backend.settings.stored = { ...backend.settings.stored, startup: 'emptyDocument' };
    const { fixture, el } = await app();
    const store = TestBed.inject(FilesService).store();
    await TestBed.inject(ActionService).run('file.newFromTemplate');
    await settle(fixture);
    expect(screen(el)).not.toBeNull();
    expect((document.activeElement as HTMLElement).dataset['template']).toBe('ios');
    // arrows stay in the grid: no canvas nudge, no other shortcut
    key('ArrowDown');
    await fixture.whenStable();
    key('Escape');
    await settle(fixture);
    expect(screen(el)).toBeNull();
    expect(TestBed.inject(FilesService).store()).toBe(store);
  });

  it('with an argument the template opens at once', async () => {
    backend.settings.stored = { ...backend.settings.stored, startup: 'emptyDocument' };
    const { fixture } = await app();
    await TestBed.inject(ActionService).run('file.newFromTemplate', { template: 'watchos' });
    await settle(fixture);
    const doc = TestBed.inject(FilesService).store()!.document();
    expect([...doc.assets.keys()]).toEqual(['leaf.svg']);
    expect(TestBed.inject(ActionService).run('file.newFromTemplate', { template: 'x' })).toBe(
      false,
    );
  });

  it('recent icons show their preview, name and folder; Enter opens one', async () => {
    // open and save once: the file is recent and has a preview (design 082 E5)
    backend.settings.stored = { ...backend.settings.stored, startup: 'emptyDocument' };
    const { fixture, el } = await app(FakeIconFileApi.CAMSCANNER);
    await TestBed.inject(ThumbnailService).pending;
    expect(backend.recent.thumbnails.has(FakeIconFileApi.CAMSCANNER)).toBe(true);
    await TestBed.inject(ActionService).run('file.startScreen');
    await settle(fixture);
    const grid = el.querySelector('[data-testid="start-recent"]')!;
    const cell = grid.querySelector<HTMLElement>('[role="gridcell"]')!;
    expect(cell.getAttribute('aria-label')).toBe('camscanner.icon, /fixtures');
    expect(cell.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(document.activeElement).toBe(cell);
    // the same file: the screen closes and the document stays
    key('Enter');
    await settle(fixture);
    expect(screen(el)).toBeNull();
    expect(title(el)).toContain('camscanner.icon');
  });
});
