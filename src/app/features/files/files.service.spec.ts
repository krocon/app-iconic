import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { CAMSCANNER_ICON } from '../../../testing/fixtures/camscanner-icon';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { AskService } from '../../shared/ask/ask.service';
import { SetAttribute } from '../document/commands';
import { FilesService } from './files.service';

const CAM = FakeIconFileApi.CAMSCANNER;
const flush = () => new Promise((r) => setTimeout(r));

describe('FilesService', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let files: FilesService;
  let ask: AskService;
  /** The next question is answered with `id`; the asked titles are collected. */
  let answers: string[];
  let asked: string[];

  beforeEach(async () => {
    backend = fakeBackend();
    TestBed.configureTestingModule({ providers: backend.providers });
    files = TestBed.inject(FilesService);
    ask = TestBed.inject(AskService);
    answers = [];
    asked = [];
    vi.spyOn(ask, 'ask').mockImplementation(async (q) => {
      asked.push(q.title);
      return answers.shift() ?? q.cancel;
    });
  });

  async function started(start: string | null = null) {
    backend.window.start = start;
    await files.start();
    TestBed.tick();
  }

  function edit() {
    const s = files.store()!;
    const asset = [...s.document().assets.keys()][0];
    const id = s.document().assets.get(asset)!.svg!.root.getAttribute('data-ai-id')!;
    s.execute(new SetAttribute({ asset, id }, 'opacity', '0.5'));
    TestBed.tick();
  }

  it('starts with a new document, takes over closing and sets the title', async () => {
    await started();
    expect(files.store()!.pristine()).toBe(true);
    expect(backend.window.tookOverClose).toBe(true);
    expect(backend.window.titles.at(-1)).toEqual(['Untitled', false, null]);
  });

  it('starts with the window start path; a failing one ends in a new document', async () => {
    await started(CAM);
    expect(files.title()).toBe('camscanner.icon');
    expect(backend.window.titles.at(-1)).toEqual(['camscanner.icon', false, CAM]);
    expect(backend.recent.paths).toEqual([CAM]);
  });

  it('a start path that fails reports it and opens a new document', async () => {
    await started('/gone.icon');
    expect(asked).toEqual(['“/gone.icon” could not be opened.']);
    expect(files.store()!.document().path).toBeNull();
  });

  it('marks the title as edited and saves only when dirty', async () => {
    await started(CAM);
    expect(await files.save()).toBe(true);
    expect(backend.files.saved).toHaveLength(0);
    edit();
    expect(backend.window.title).toBe('• camscanner.icon');
    expect(await files.save()).toBe(true);
    TestBed.tick();
    expect(backend.files.saved).toHaveLength(1);
    expect(backend.files.saved[0].assets.filter((a) => !a.unchanged)).toHaveLength(1);
    expect(backend.window.title).toBe('camscanner.icon');
    expect(files.dirty()).toBe(false);
  });

  it('saving without changes keeps every byte', async () => {
    await started(CAM);
    edit();
    files.undo();
    await files.saveAs().then(() => undefined);
    // Save As asked for the format and was cancelled
    expect(asked).toEqual(['Save As']);
    answers.push('bundle');
    backend.files.picks.push(CAM);
    edit();
    files.undo();
    expect(files.dirty()).toBe(false);
    expect(await files.saveAs()).toBe(true);
    const saved = backend.files.files.get(CAM)!;
    expect(saved.iconJson).toBe(CAMSCANNER_ICON.iconJson);
    expect(saved.assets.map((a) => a.text)).toEqual(CAMSCANNER_ICON.assets.map((a) => a.text));
  });

  it('Save As writes the chosen format to the picked path and remembers it', async () => {
    await started(CAM);
    edit();
    answers.push('zip');
    backend.files.picks.push('/out/x.icon');
    expect(await files.saveAs()).toBe(true);
    TestBed.tick();
    expect(backend.files.saved[0]).toMatchObject({ path: '/out/x.icon', format: 'zip', from: CAM });
    expect(files.title()).toBe('x.icon');
    expect(backend.recent.paths[0]).toBe('/out/x.icon');
    expect(backend.window.titles.at(-1)).toEqual(['x.icon', false, '/out/x.icon']);
  });

  it('a new document is saved through Save As', async () => {
    await started();
    answers.push('bundle');
    backend.files.picks.push('/n.icon');
    expect(await files.save()).toBe(true);
    expect(backend.files.saved[0].assets).toEqual([
      { name: 'layer.svg', unchanged: false, text: expect.stringContaining('<svg') },
    ]);
  });

  it('a failed save keeps the document dirty and tells why', async () => {
    await started(CAM);
    edit();
    backend.files.failNext = { code: 'permission_denied', message: 'x' };
    expect(await files.save()).toBe(false);
    expect(asked).toEqual(['The icon could not be saved.']);
    expect(files.dirty()).toBe(true);
  });

  it('Open replaces an untouched new document, else opens a new window', async () => {
    await started();
    backend.files.picks.push(CAM);
    await files.open();
    expect(files.store()!.document().path).toBe(CAM);
    edit();
    backend.files.picks.push('/other.icon');
    await files.open();
    expect(backend.window.opened).toEqual(['/other.icon']);
    expect(files.store()!.document().path).toBe(CAM);
  });

  it('Open brings a window that already shows the file to the front', async () => {
    await started();
    backend.window.elsewhere.add(CAM);
    await files.openRecent(CAM);
    expect(files.store()!.document().path).toBeNull();
    expect(backend.files.saved).toHaveLength(0);
  });

  it('New Document asks Save / Don’t Save / Cancel when dirty', async () => {
    await started(CAM);
    edit();
    await files.newDocument(); // cancel (default)
    expect(files.store()!.document().path).toBe(CAM);
    expect(asked).toEqual(['Do you want to save the changes to “camscanner.icon”?']);
    answers.push('discard');
    await files.newDocument();
    expect(files.store()!.document().path).toBeNull();
    expect(backend.files.saved).toHaveLength(0);
  });

  it('New Document with "Save" saves first', async () => {
    await started(CAM);
    edit();
    answers.push('save');
    await files.newDocument();
    expect(backend.files.saved).toHaveLength(1);
    expect(files.store()!.document().path).toBeNull();
  });

  it('Close asks when dirty and closes the window; the close button does the same', async () => {
    await started(CAM);
    edit();
    backend.window.requestClose();
    await flush();
    expect(backend.window.closed).toBe(false);
    answers.push('discard');
    backend.window.requestClose();
    await flush();
    expect(backend.window.closed).toBe(true);
  });

  it('Close without changes does not ask', async () => {
    await started();
    await files.close();
    expect(asked).toEqual([]);
    expect(backend.window.closed).toBe(true);
  });

  it('imports an SVG as group + layer + asset, one undo removes all', async () => {
    await started(CAM);
    const before = files.store()!.document().snapshot();
    backend.files.svgFiles.set('/in/logo-scanner 3.svg', {
      name: 'logo-scanner 3.svg',
      text: '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script><rect onclick="y()"/></svg>',
    });
    backend.files.picks.push('/in/logo-scanner 3.svg');
    await files.importSvg();
    const s = files.store()!;
    const doc = s.document();
    expect([...doc.assets.keys()]).toContain('logo-scanner 3 2.svg');
    const group = doc.iconJson.groups!.at(-1)!;
    expect(group.layers).toEqual([
      { 'image-name': 'logo-scanner 3 2.svg', name: 'logo-scanner 3 2' },
    ]);
    expect(group.shadow).toEqual({ kind: 'neutral', opacity: 0.5 });
    expect(s.undoLabel()).toBe('Undo Import SVG');
    expect(files.notice()).toContain('removed scripts');
    s.undo();
    expect(s.document().snapshot()).toBe(before);
  });

  it('an invalid SVG is reported, nothing changes', async () => {
    await started(CAM);
    backend.files.svgFiles.set('/x.svg', { name: 'x.svg', text: 'nope' });
    backend.files.picks.push('/x.svg');
    await files.importSvg();
    expect(asked).toEqual(['The SVG could not be imported.']);
    expect(files.store()!.canUndo()).toBe(false);
  });

  it('runs one action at a time', async () => {
    await started(CAM);
    edit();
    let release!: (v: string) => void;
    vi.mocked(ask.ask).mockImplementationOnce(() => new Promise((r) => (release = r)));
    const first = files.close();
    await flush();
    await files.close(); // ignored while the question is open
    release('cancel');
    await first;
    expect(vi.mocked(ask.ask)).toHaveBeenCalledTimes(1);
  });

  it('frees the backend session of a replaced document', async () => {
    await started(CAM);
    const close = vi.spyOn(backend.files, 'closeIcon');
    await files.newDocument();
    expect(close).toHaveBeenCalledWith(CAM);
  });

  it('New Window asks the backend for one', async () => {
    await started();
    await files.newWindow();
    expect(backend.window.opened).toEqual([null]);
  });
});
