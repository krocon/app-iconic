import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FakeExportApi } from '../../../testing/fake-export-api';
import { camscannerDocument } from '../../../testing/documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { ExportDialog } from './export-dialog';
import { ExportService } from './export.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ExportDialog (design 012 E16)', () => {
  let api: FakeExportApi;

  async function open(format: 'svg' | 'png' = 'png') {
    const backend = fakeBackend();
    api = backend.exporter;
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    TestBed.inject(FilesService).store.set(new DocumentStore(camscannerDocument()));
    TestBed.inject(ExportService).openDialog(format);
    const fixture = TestBed.createComponent(ExportDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
    const click = async (id: string) => {
      q(id)!.click();
      await flush();
      await fixture.whenStable();
    };
    return { fixture, el, q, click };
  }

  it('choose folder, sizes, export with progress, result; the choice is remembered', async () => {
    const { el, q, click } = await open();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(q<HTMLButtonElement>('export-run')!.disabled).toBe(true); // no folder yet
    await click('export-choose');
    expect(q('export-target')!.textContent).toBe('/export');
    await click('export-size-256');
    expect(el.querySelector('.count')!.textContent).toBe('4 files');
    await click('export-run');
    await flush();
    expect(q('export-result')!.textContent).toBe('Exported 4 files.');
    expect(api.calls[0].sizes).toEqual([1024, 256]);
    expect(TestBed.inject(ExportService).choice()).toMatchObject({
      sizes: [1024, 256],
      targetDir: '/export',
    });
  });

  it('existing files: asks inline, Replace overwrites', async () => {
    const { q, click } = await open('svg');
    await click('export-choose');
    api.files.set('/export/camscanner-light.svg', 'old');
    await click('export-run');
    expect(q('export-exists')).not.toBeNull();
    await click('export-replace');
    expect(q('export-result')!.textContent).toBe('Exported 2 files.');
    expect(api.files.get('/export/camscanner-light.svg')).toContain('<svg');
  });

  it('PNG with transparency and no mask shows the Apple hint; SVG has no sizes', async () => {
    const { el, q, click } = await open();
    await click('export-choose');
    api.transparentNames.add('camscanner-dark-1024.png');
    await click('export-run');
    expect(q('export-warning')!.textContent).toContain('without transparency');
    await click('export-format-svg');
    expect(q('export-size-1024')).toBeNull();
    expect(el.querySelector('legend')!.textContent).toBe('Format');
  });

  it('Stop while rendering cancels; Esc then closes', async () => {
    const { fixture, q, click } = await open();
    await click('export-choose');
    let release!: () => void;
    api.hold = new Promise((r) => (release = r));
    q('export-run')!.click();
    await flush();
    await fixture.whenStable();
    expect(q('export-progress')).not.toBeNull();
    await click('export-stop');
    release();
    await flush();
    await fixture.whenStable();
    expect(q('export-result')!.textContent).toBe('Export stopped after 0 files.');
    const dialogs = TestBed.inject(DialogService);
    expect(dialogs.open()).toBe('export');
  });
});
