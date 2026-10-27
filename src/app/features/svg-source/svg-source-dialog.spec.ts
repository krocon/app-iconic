import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import type { CodeEditorOptions, CodeProblem } from './code-editor';
import { CODE_EDITOR_LOADER, SvgSourceDialog } from './svg-source-dialog';
import { SvgSourceService } from './svg-source.service';

const a = (id: string) => ({ asset: 'a.svg', id });
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A stand-in for CodeMirror: remembers the text and the problem marker. */
class FakeEditor {
  value: string;
  problem: CodeProblem | null = null;
  constructor(private readonly opts: CodeEditorOptions) {
    this.value = opts.text;
  }
  type(text: string) {
    this.value = text;
    this.opts.onChange(text);
  }
  apply() {
    this.opts.onApply();
  }
  handle() {
    return {
      text: () => this.value,
      setText: (t: string) => this.type(t),
      setProblem: (p: CodeProblem | null) => (this.problem = p),
      focus: () => undefined,
      destroy: () => undefined,
    };
  }
}

describe('SvgSourceDialog (design 011 E3–E7)', () => {
  let store: DocumentStore;
  let editor: FakeEditor | null;
  let dialogs: DialogService;

  async function open(loader?: () => Promise<never>) {
    editor = null;
    TestBed.configureTestingModule({
      providers: [
        ...fakeBackend().providers,
        { provide: OS, useValue: 'mac' },
        {
          provide: CODE_EDITOR_LOADER,
          useValue:
            loader ??
            (() =>
              Promise.resolve((_el: HTMLElement, opts: CodeEditorOptions) => {
                editor = new FakeEditor(opts);
                return editor.handle();
              })),
        },
      ],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    dialogs = TestBed.inject(DialogService);
    store.select([a('n7')]);
    TestBed.inject(SvgSourceService).openDialog();
    const fixture = TestBed.createComponent(SvgSourceDialog);
    fixture.detectChanges();
    await flush();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    return { fixture, el, q };
  }

  it('shows the node source; Apply only for valid, changed text', async () => {
    const { fixture, q } = await open();
    expect(editor!.value).toContain('<rect');
    expect(q('svg-source-subtitle').textContent).toContain('<rect>');
    const apply = q('svg-source-apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(q('svg-source-status').textContent).toContain('No changes');

    editor!.type('<rect width="10"');
    fixture.detectChanges();
    expect(apply.disabled).toBe(true);
    expect(q('svg-source-status').getAttribute('role')).toBe('alert');
    expect(q('svg-source-status').textContent).toMatch(/Line 1, column \d+/);
    expect(editor!.problem).not.toBeNull();

    editor!.type('<rect width="10" fill="blue"/>');
    fixture.detectChanges();
    expect(editor!.problem).toBeNull();
    expect(apply.disabled).toBe(false);
    apply.click();
    expect(dialogs.open()).toBeNull();
    expect(store.document().node(store.selection()[0])!.getAttribute('fill')).toBe('blue');
    expect(store.undoLabel()).toBe('Undo Edit SVG Code');
  });

  it('Mod-Enter in the editor applies', async () => {
    const { fixture } = await open();
    editor!.type('<rect fill="red"/>');
    fixture.detectChanges();
    editor!.apply();
    expect(store.canUndo()).toBe(true);
  });

  it('Format formats with the chosen decimals', async () => {
    const { fixture, q } = await open();
    editor!.type('<g><rect x="1.23456"/></g>');
    fixture.detectChanges();
    const precision = q('svg-source-precision') as HTMLInputElement;
    precision.value = '1';
    precision.dispatchEvent(new Event('change'));
    q('svg-source-format').click();
    expect(editor!.value).toBe('<g>\n  <rect x="1.2"/>\n</g>');
  });

  it('Cancel with changes asks inside the dialog; Discard closes without a step', async () => {
    const { fixture, q } = await open();
    editor!.type('<rect fill="red"/>');
    fixture.detectChanges();
    q('svg-source-cancel').click();
    fixture.detectChanges();
    expect(dialogs.open()).toBe('svgSource');
    expect(q('svg-source-confirm')).toBeTruthy();
    q('svg-source-discard').click();
    expect(dialogs.open()).toBeNull();
    expect(store.canUndo()).toBe(false);
  });

  it('Cancel without changes closes at once', async () => {
    const { q } = await open();
    q('svg-source-cancel').click();
    expect(dialogs.open()).toBeNull();
  });

  it('falls back to a text area when the editor cannot be loaded', async () => {
    const { fixture, q } = await open(() => Promise.reject(new Error('offline')));
    const area = q('svg-source-fallback') as HTMLTextAreaElement;
    expect(area.value).toContain('<rect');
    area.value = '<circle r="2"/>';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (q('svg-source-apply') as HTMLButtonElement).click();
    expect(store.document().node(store.selection()[0])!.localName).toBe('circle');
  });
});

describe('createCodeEditor (CodeMirror in jsdom)', () => {
  it('mounts, reports changes and shows a lint marker', async () => {
    const { createCodeEditor } = await import('./code-editor');
    const parent = document.createElement('div');
    document.body.append(parent);
    const changes: string[] = [];
    const ed = createCodeEditor(parent, {
      text: '<rect/>',
      label: 'SVG source',
      onChange: (t) => changes.push(t),
      onApply: () => undefined,
    });
    expect(
      parent.querySelector('[data-testid="svg-source-editor"]')?.getAttribute('aria-label'),
    ).toBe('SVG source');
    ed.setText('<rect');
    expect(changes).toEqual(['<rect']);
    expect(ed.text()).toBe('<rect');
    ed.setProblem({ from: 0, to: 1, message: 'broken' });
    ed.setProblem(null);
    ed.destroy();
    parent.remove();
  });
});
