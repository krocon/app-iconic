import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeExportApi } from '../../../testing/fake-export-api';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { camscannerDocument, smallDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { SetAttribute } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { exportSvg } from '../export/export-svg';
import { FilesService } from '../files/files.service';
import { registerMockupsActions } from './mockups-actions';
import { iconName, lookOptions, MockupsService } from './mockups.service';

/** The nested icon SVG of a scene SVG (decoded). */
function iconOf(sceneSvg: string): string {
  const d = new DOMParser().parseFromString(sceneSvg, 'image/svg+xml');
  const href = d.querySelector('image[data-own]')!.getAttribute('href')!;
  const bytes = Uint8Array.from(atob(href.split(',')[1]), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe('MockupsService (prompt 081)', () => {
  let api: FakeExportApi;
  let iconFiles: FakeIconFileApi;
  let files: FilesService;
  let service: MockupsService;
  let actions: ActionService;

  beforeEach(() => {
    const backend = fakeBackend();
    api = backend.exporter;
    iconFiles = backend.files;
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    files = TestBed.inject(FilesService);
    files.store.set(new DocumentStore(camscannerDocument()));
    service = TestBed.inject(MockupsService);
    actions = TestBed.inject(ActionService);
    registerMockupsActions(actions, service);
  });

  it('copy: the current scene at scale 2, built from the export SVG of its look', async () => {
    expect(actions.run('mockups.copyPng')).toBe(true);
    await vi.waitFor(() => expect(api.scenes).toHaveLength(1));
    const { svg, scale, path } = api.scenes[0];
    expect([scale, path]).toEqual([2, null]);
    expect(svg).toContain('data-scene="dock"');
    const doc = files.store()!.document();
    const view = TestBed.inject(CanvasViewStore).options();
    // the Dock shows the macOS template (078 E4)
    expect(iconOf(svg)).toBe(exportSvg(doc, 'light', lookOptions('macos', view)));
    expect(files.notice()).toBe('macOS Dock copied as PNG.');
  });

  it('save: a named scene through the Rust dialog; cancelled = nothing', async () => {
    expect(await service.savePng({ scene: 'homeDark', scale: 3 })).toBe(true);
    expect(api.scenes[0].path).toBe('/export/camscanner – iOS Home Screen (dark).png');
    expect(api.scenes[0].scale).toBe(3);
    expect(api.scenes[0].svg).toContain('data-appearance="dark"');
    expect(service.current()).toBe('homeDark');
    api.scenePicks.push(null);
    files.notice.set(null);
    expect(await service.savePng()).toBe(false);
    expect(files.notice()).toBeNull();
  });

  it('bad arguments, no document and backend errors become notices', async () => {
    expect(await service.copyPng({ scene: 'desk' })).toBe(false);
    expect(await service.copyPng({ scale: 7 })).toBe(false);
    expect(files.notice()).toBe('The scene could not be rendered: Unknown scene or scale.');
    api.failNext = { code: 'too_large', message: 'x' };
    expect(await service.copyPng()).toBe(false);
    expect(files.notice()).toMatch(/^The scene could not be rendered: /);
    files.store.set(null);
    expect(await service.copyPng()).toBe(false);
    expect(files.notice()).toBe('No document is open.');
  });

  it('the appearance is chosen per scene; the dark home screen shows the dark variant', async () => {
    expect(service.appearances().homeDark).toBe('dark');
    await service.copyPng({ scene: 'homeDark' });
    const doc = files.store()!.document();
    const view = TestBed.inject(CanvasViewStore).options();
    expect(iconOf(api.scenes[0].svg)).toBe(exportSvg(doc, 'dark', lookOptions('squircle', view)));
    expect(actions.run('mockups.appearance', { scene: 'homeDark', appearance: 'tinted' })).toBe(
      true,
    );
    await service.copyPng({ scene: 'homeDark' });
    expect(iconOf(api.scenes[1].svg)).toBe(exportSvg(doc, 'tinted', lookOptions('squircle', view)));
    expect(service.setAppearance('homeDark', 'sepia')).toBe(false);
    // the taskbar takes the canvas mask (like the .ico export)
    expect(lookOptions('view', { ...view, mask: 'circle' }).mask).toBe('circle');
  });

  it('scale action and background image (PNG/JPEG/WebP only, via the open dialog)', async () => {
    actions.run('mockups.scale', { scale: 1 });
    expect(service.scale()).toBe(1);
    expect(actions.run('mockups.scale', { scale: 5 })).toBe(false);
    expect(actions.enabled('mockups.clearBackground')).toBe(false);
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    iconFiles.imageFiles.set('/p/bg.png', {
      name: 'bg.png',
      mime: 'image/png',
      dataUrl: png,
      width: 1,
      height: 1,
    });
    iconFiles.picks.push('/p/bg.png');
    expect(await service.pickBackground()).toBe(true);
    expect(service.background()).toEqual({ dataUrl: png });
    await service.copyPng({ scene: 'taskbar' });
    expect(api.scenes[0].svg).toContain(png);
    expect(api.scenes[0].scale).toBe(1);
    iconFiles.imageFiles.set('/p/a.svg', {
      name: 'a.svg',
      mime: 'image/svg+xml',
      dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      width: null,
      height: null,
    });
    iconFiles.picks.push('/p/a.svg');
    expect(await service.pickBackground()).toBe(false);
    expect(files.notice()).toBe('Choose a PNG, JPEG or WebP image as background.');
    expect(service.background()).toEqual({ dataUrl: png });
    iconFiles.picks.push('/p/missing.png');
    expect(await service.pickBackground()).toBe(false);
    expect(files.notice()).toMatch(/^The background image could not be read: /);
    actions.run('mockups.clearBackground');
    expect(service.background()).toBeNull();
  });

  it('the panel draws every scene after a change, but not during a gesture', async () => {
    const store = new DocumentStore(smallDocument());
    files.store.set(store);
    const draw = vi.spyOn(service as unknown as { draw: () => Promise<void> }, 'draw');
    expect(service.scenes().every((s) => s.url === null)).toBe(true);
    actions.run('view.mockups');
    expect(TestBed.inject(DialogService).open()).toBe('mockups');
    expect(actions.checked('view.mockups')).toBe(true);
    await vi.waitFor(() => expect(service.scenes().every((s) => s.url !== null)).toBe(true));
    const before = service.scenes().map((s) => s.url);
    const calls = draw.mock.calls.length;
    store.begin('changeFill');
    store.update(new SetAttribute({ asset: 'a.svg', id: 'n3' }, 'fill', '#123456', 'changeFill'));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 400));
    expect(draw.mock.calls.length).toBe(calls);
    store.commit();
    TestBed.tick();
    await vi.waitFor(() => expect(draw.mock.calls.length).toBe(calls + 1));
    await vi.waitFor(() =>
      expect(service.scenes().every((s, i) => s.url !== before[i])).toBe(true),
    );
    actions.run('view.mockups');
    expect(TestBed.inject(DialogService).open()).toBeNull();
  });

  it('labels use the document name without .icon', () => {
    expect(iconName('Camscanner.icon')).toBe('Camscanner');
    expect(iconName('Untitled')).toBe('Untitled');
    expect(service.scenes()[1].title).toBe('camscanner in iOS Home Screen (light), Light');
  });
});
