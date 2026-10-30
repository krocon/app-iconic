import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeExportApi } from '../../../testing/fake-export-api';
import { camscannerDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { AskService } from '../../shared/ask/ask.service';
import { tintedMatrix } from '../canvas/tinted';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { registerExportActions } from './export-actions';
import { DEFAULT_CHOICE } from './export-options';
import { ExportService } from './export.service';

describe('ExportService (design 012)', () => {
  let api: FakeExportApi;
  let files: FilesService;
  let service: ExportService;
  let actions: ActionService;

  beforeEach(() => {
    const backend = fakeBackend();
    api = backend.exporter;
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    files = TestBed.inject(FilesService);
    files.store.set(new DocumentStore(camscannerDocument()));
    service = TestBed.inject(ExportService);
    actions = TestBed.inject(ActionService);
    registerExportActions(actions, service);
  });

  const req = (extra: object = {}) => ({
    ...DEFAULT_CHOICE,
    targetDir: '/out',
    overwrite: false,
    ...extra,
  });

  it('PNG: one SVG per appearance, file stem from the document, progress per file', async () => {
    const seen: number[] = [];
    const progress = service.progress;
    const o = await service.export(req({ sizes: [512, 16] }));
    expect(o.kind).toBe('done');
    const call = api.calls[0];
    expect(call.kind).toBe('png');
    expect(call.variants.map((v) => v.appearance)).toEqual(['light', 'dark']);
    expect(call.variants[0].svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1024"');
    expect(call.variants[1].svg).toContain('#3a3a3c'); // dark system background
    expect(call.options).toEqual({ baseName: 'camscanner', overwrite: false });
    expect(call.sizes).toEqual([512, 16]);
    seen.push(progress()!.done);
    expect(seen).toEqual([4]);
    expect([...api.files.keys()]).toEqual([
      '/out/camscanner-light-512.png',
      '/out/camscanner-light-16.png',
      '/out/camscanner-dark-512.png',
      '/out/camscanner-dark-16.png',
    ]);
    expect(service.running()).toBe(false);
  });

  it('SVG: files per appearance; mask and effects reach the SVG', async () => {
    const o = await service.export(
      req({ format: 'svg', appearances: ['dark'], mask: 'circle', effects: true }),
    );
    expect(o.kind).toBe('done');
    const svg = api.files.get('/out/camscanner-dark.svg')!;
    expect(svg).toContain('clip-path="url(#ai-export-mask)"');
    expect(svg).toContain('<filter');
  });

  it('existing files: nothing written, then overwrite after confirmation (E11)', async () => {
    api.files.set('/out/camscanner-light-1024.png', 'old');
    expect((await service.export(req())).kind).toBe('exists');
    expect(api.files.get('/out/camscanner-light-1024.png')).toBe('old');
    expect((await service.export(req({ overwrite: true }))).kind).toBe('done');
    expect(api.files.get('/out/camscanner-light-1024.png')).not.toBe('old');
  });

  it('Apple hint: transparent PNG without mask warns, with mask not (E13)', async () => {
    api.transparentNames.add('camscanner-light-1024.png');
    const o = await service.export(req());
    expect(o.kind === 'done' && o.transparentWarning).toBe(true);
    const masked = await service.export(req({ mask: 'squircle', overwrite: true }));
    expect(masked.kind === 'done' && masked.transparentWarning).toBe(false);
    const svg = await service.export(req({ format: 'svg' }));
    expect(svg.kind === 'done' && svg.transparentWarning).toBe(false);
  });

  it('cancel stops between files (E12)', async () => {
    let release!: () => void;
    api.hold = new Promise((r) => (release = r));
    const running = service.export(req({ sizes: [1024, 512] }));
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    expect(service.running()).toBe(true);
    expect(actions.enabled('file.exportPng')).toBe(false);
    service.cancel();
    release();
    const o = await running;
    expect(o.kind === 'cancelled' && o.report.files).toEqual([]);
    // Stop while the SVGs are still being built: the backend never gets the job
    api.hold = null;
    const early = service.export(req());
    service.cancel();
    expect((await early).kind).toBe('cancelled');
    expect(api.calls).toHaveLength(1);
  });

  it('errors become texts; no document / no folder', async () => {
    api.failNext = { code: 'permission_denied', message: 'os error 13' };
    const o = await service.export(req());
    expect(o).toEqual({ kind: 'error', message: 'Export failed: Access denied.' });
    expect((await service.export(req({ targetDir: null }))).kind).toBe('noTarget');
    files.store.set(null);
    expect((await service.export(req())).kind).toBe('noDocument');
    expect(actions.enabled('file.exportSvg')).toBe(false);
  });

  it('actions: no arguments → dialog with the format; arguments → straight away (AI)', async () => {
    const dialogs = TestBed.inject(DialogService);
    expect(actions.run('file.exportSvg')).toBe(true);
    expect(dialogs.open()).toBe('export');
    expect(service.choice().format).toBe('svg');
    dialogs.close();
    api.picks.push('/picked');
    expect(actions.run('file.exportPng', { sizes: [64, 32], appearances: ['light'] })).toBe(true);
    await vi.waitFor(() => expect(api.calls).toHaveLength(1));
    await vi.waitFor(() => expect(files.notice()).toBe('Exported 2 files.'));
    expect([...api.files.keys()]).toEqual([
      '/picked/camscanner-light-64.png',
      '/picked/camscanner-light-32.png',
    ]);
    // the remembered choice is the dialog's, not changed by the AI
    expect(service.choice().sizes).toEqual([1024]);
    // existing files without overwrite → notice, nothing replaced
    actions.run('file.exportPng', { sizes: [64], appearances: ['light'], targetDir: '/picked' });
    await vi.waitFor(() => expect(files.notice()).toContain('already exist'));
    expect(actions.run('file.exportPng', { mask: 'star' })).toBe(false);
    actions.run('file.exportPng', { sizes: [100] });
    await vi.waitFor(() => expect(files.notice()).toContain('unknown appearance, size or tint'));
  });

  it('shows the last export in the file manager (design 030 E6)', async () => {
    expect(actions.enabled('file.revealExport')).toBe(false);
    await service.export(req({ format: 'svg' }));
    expect(service.lastExport()).toBe('/out/camscanner-light.svg');
    expect(actions.enabled('file.revealExport')).toBe(true);
    actions.run('file.revealExport');
    await Promise.resolve();
    expect(api.revealed).toEqual(['/out/camscanner-light.svg']);
    // a file that is gone: a notice, no crash
    api.files.clear();
    expect(await service.reveal()).toBe(false);
    expect(files.notice()).toContain('could not be shown');
  });

  describe('packages, export again, copy PNG (prompt 078)', () => {
    it('icon set: sources per platform, folder report, reveal shows the folder', async () => {
      const o = await service.export(
        req({ format: 'appiconset', appearances: ['light', 'dark', 'tinted'], tint: '#ff0000' }),
      );
      expect(o.kind).toBe('done');
      const call = api.packages[0];
      expect(call.kind).toEqual({
        kind: 'appIconSet',
        ios: true,
        appearances: ['dark', 'tinted'],
        macos: true,
        watchos: false,
      });
      const ids = call.sources.map((s) => s.id);
      expect(ids).toEqual(['ios-light', 'ios-dark', 'ios-tinted', 'macos']);
      const svg = (id: string) => call.sources.find((s) => s.id === id)!.svg;
      // tinted in grey (white tint), not the chosen red
      expect(svg('ios-tinted')).toContain('<feColorMatrix');
      expect(svg('ios-tinted')).toContain(tintedMatrix('#ffffff'));
      // macOS: framed (824 squircle, 100 margin, shadow); iOS: no mask at all
      expect(svg('macos')).toContain('translate(100 100) scale(0.8046875)');
      expect(svg('macos')).toContain('feDropShadow');
      expect(svg('ios-light')).not.toContain('clip-path');
      expect(o.kind === 'done' && o.transparentWarning).toBe(false);
      expect(service.lastExport()).toBe('/out/AppIcon.appiconset');
      expect(api.files.has('/out/AppIcon.appiconset/mac-512x512@2x.png')).toBe(true);
      // the same set again: exists (the folder is one target)
      expect((await service.export(req({ format: 'appiconset' }))).kind).toBe('exists');
    });

    it('icns / ico as single files; ico takes the chosen mask', async () => {
      await service.export(req({ format: 'ico', mask: 'circle' }));
      await service.export(req({ format: 'icns' }));
      expect([...api.files.keys()]).toEqual(['/out/camscanner.ico', '/out/camscanner.icns']);
      expect(api.packages[0].sources[0].svg).toContain('<circle');
      expect(api.packages[1].sources[0].id).toBe('macos');
    });

    it('export again repeats the last export of this document and asks before replacing', async () => {
      expect(actions.enabled('file.exportAgain')).toBe(false);
      await service.export(req({ format: 'ico' }));
      expect(actions.enabled('file.exportAgain')).toBe(true);
      const ask = TestBed.inject(AskService);
      const again = service.exportAgain();
      await vi.waitFor(() => expect(ask.current()).not.toBeNull());
      ask.answer('replace');
      expect((await again).kind).toBe('done');
      expect(api.calls.at(-1)!.options.overwrite).toBe(true);
      expect(files.notice()).toBe('Exported 1 file.');
      // per document: another document has nothing to repeat
      files.store.set(new DocumentStore(camscannerDocument()));
      expect(actions.enabled('file.exportAgain')).toBe(false);
    });

    it('copy PNG: the canvas appearance, size 1024 by default, errors as notice', async () => {
      expect(actions.run('file.copyPng')).toBe(true);
      await vi.waitFor(() => expect(api.clipboard).toHaveLength(1));
      expect(api.clipboard[0].size).toBe(1024);
      expect(files.notice()).toBe('PNG (1024 px) copied to the clipboard.');
      await service.copyPng({ size: 64, appearance: 'dark' });
      expect(api.clipboard[1].size).toBe(64);
      expect(api.clipboard[1].svg).toContain('#3a3a3c');
      expect(await service.copyPng({ size: 100 })).toBe(false);
      api.failNext = { code: 'unavailable', message: 'x' };
      expect(await service.copyPng()).toBe(false);
      expect(files.notice()).toContain('could not be copied');
    });
  });

  it('Android and web sources (prompt 079): layers, grey monochrome, favicon light + dark', async () => {
    const o = await service.export(req({ format: 'android', backgroundGroups: [0] }));
    expect(o).toMatchObject({ kind: 'done', report: { folder: '/out/android' } });
    const a = api.packages[0];
    const svg = (id: string) => a.sources.find((s) => s.id === id)!.svg;
    expect(svg('android-monochrome')).toContain(tintedMatrix('#ffffff'));
    expect(svg('android-monochrome')).not.toContain('ai-export-background');
    expect(svg('android-background')).toContain('ai-export-background');
    expect(svg('android-foreground')).toContain('scale(0.6667)');
    expect(svg('android-legacy')).toContain('clip-path="url(#ai-export-mask)"');
    const w = await service.export(req({ format: 'web', mask: 'squircle' }));
    expect(w.kind).toBe('done');
    const web = api.packages[1];
    const fav = web.sources.find((s) => s.id === 'web-favicon')!.svg;
    expect(fav).toContain('prefers-color-scheme: dark');
    expect(fav).toContain('#3a3a3c'); // dark system background in the dark half
    expect(web.sources.find((s) => s.id === 'web-maskable')!.svg).toContain('scale(0.8)');
  });
});
