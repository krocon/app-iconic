import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { fakePng } from '../../../testing/fake-trace-api';
import { smallDocument } from '../../../testing/documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { groups, layers } from '../document/model/icon-json';
import { FilesService } from '../files/files.service';
import { TemplateStore } from '../template/template.store';
import { TRACE_DELAY, TraceDialog } from './trace-dialog';
import { TraceService } from './trace.service';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TraceDialog (prompt 087 E16)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;

  beforeEach(async () => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(smallDocument());
    TestBed.inject(FilesService).store.set(store);
    TestBed.inject(TemplateStore).set({
      name: 'Calc.png',
      dataUrl: fakePng(256, 256),
      width: 256,
      height: 256,
    });
    expect(await TestBed.inject(TraceService).open()).toBe(true);
  });

  async function render() {
    const fixture = TestBed.createComponent(TraceDialog);
    document.body.append(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends Element>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
    const settle = async () => {
      await fixture.whenStable();
      await wait(TRACE_DELAY + 30);
      await fixture.whenStable();
    };
    await settle();
    return { fixture, el, q, settle };
  }

  it('previews the real result of the template with its summary', async () => {
    const { q } = await render();
    expect(TestBed.inject(DialogService).open()).toBe('trace');
    expect(q('trace-source-name').textContent).toContain('Calc.png · 256 × 256 px');
    expect(q<HTMLButtonElement>('trace-source-template').getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLButtonElement>('trace-source-layer').disabled).toBe(true);
    expect(q('trace-preview').querySelector('img')!.getAttribute('src')).toContain('image/svg+xml');
    expect(q('trace-stats').textContent).toContain('2 elements: 1 rectangles');
    expect(backend.trace.calls.at(-1)!.options).toMatchObject({ shapes: true, scale: 4 });
    expect(q<HTMLButtonElement>('trace-insert').disabled).toBe(false);
  });

  it('a preset and a detail trace again; errors block Insert', async () => {
    const { q, settle } = await render();
    q<HTMLInputElement>('trace-preset-mono').click();
    await settle();
    expect(backend.trace.calls.at(-1)!.options).toMatchObject({ mode: 'mono', shapes: false });
    const shapes = q<HTMLInputElement>('trace-shapes');
    shapes.checked = true;
    shapes.dispatchEvent(new Event('change'));
    await settle();
    expect(backend.trace.calls.at(-1)!.options).toMatchObject({ mode: 'mono', shapes: true });
    backend.trace.failWith = 'too_large';
    const speckle = q<HTMLInputElement>('trace-speckle');
    speckle.value = '20';
    speckle.dispatchEvent(new Event('change'));
    await settle();
    expect(backend.trace.calls.at(-1)!.options.speckle).toBe(20);
    expect(q('trace-error').textContent).not.toBe('');
    expect(q<HTMLButtonElement>('trace-insert').disabled).toBe(true);
  });

  it('Insert adds the shown result as one layer and closes', async () => {
    const { q, fixture } = await render();
    q<HTMLButtonElement>('trace-insert').click();
    await fixture.whenStable();
    expect(TestBed.inject(DialogService).open()).toBeNull();
    const l = layers(groups(store.document().iconJson)[0])[0];
    expect(l['image-name']).toBe('Calc-traced.svg');
    expect(store.document().asset('Calc-traced.svg')?.svg?.root.querySelector('rect')).toBeTruthy();
  });
});
