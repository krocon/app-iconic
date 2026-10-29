import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { parsePenAnchors, PenService } from './pen.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PenService (prompt 042)', () => {
  let store: DocumentStore;
  let pen: PenService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    pen = TestBed.inject(PenService);
  });

  const node = () => store.document().node(store.selection()[0])!;

  it('anchors from the AI draw a path; malformed ones a notice', async () => {
    await pen.insertFromArgs({
      anchors: [{ p: [0, 0], out: [10, -10] }, { p: [20, 0] }],
      closed: false,
    });
    await flush();
    expect(node().localName).toBe('path');
    expect(node().getAttribute('d')).toBe('M 0 0 C 10 -10 20 0 20 0');
    expect(store.undoLabel()).toBe('Undo Add Path');
    expect(parsePenAnchors([{ p: [0, 0] }])).toBeNull();
    expect(parsePenAnchors([{ p: [0, 0] }, { p: [1, 'x'] }])).toBeNull();
    expect(await pen.insertFromArgs({ anchors: 'no' })).toBe(false);
    expect(TestBed.inject(FilesService).notice()).toContain('could not');
  });

  it('a finished path on the canvas; the pen goes off', async () => {
    pen.pen.toggle(true);
    pen.pen.press({ x: 0, y: 0 }, { x: 0, y: 0 }, 4);
    pen.pen.release();
    pen.pen.press({ x: 30, y: 40 }, { x: 50, y: 0 }, 4);
    pen.pen.release();
    await pen.finish();
    await flush();
    expect(node().getAttribute('d')).toBe('M 0 0 L 30 40');
    expect(pen.pen.on()).toBe(false);
  });
});
