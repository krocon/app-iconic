import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeExportApi } from '../../../testing/fake-export-api';
import { camscannerDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
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
});
