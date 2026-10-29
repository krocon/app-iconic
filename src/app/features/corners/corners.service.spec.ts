import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { InsertNode } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { CORNERS_ATTR, cornerSource } from './corner-source';
import { CornersService } from './corners.service';

describe('CornersService (prompt 045)', () => {
  let store: DocumentStore;
  let corners: CornersService;
  const add = (markup: string) => {
    store.execute(new InsertNode({ asset: 'a.svg', id: 'n1' }, markup));
    const root = store.document().node({ asset: 'a.svg', id: 'n1' })!;
    const el = root.lastElementChild!;
    const ref = store.document().refOf(el)!;
    store.selection.set([ref]);
    return ref;
  };
  const node = () => store.document().node(store.selection()[0])!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    corners = TestBed.inject(CornersService);
  });

  it('a rectangle keeps rx / ry while round; other kinds make a path (one undo step)', () => {
    add('<rect x="10" y="10" width="100" height="60" fill="red"/>');
    expect(corners.canApply()).toBe(true);
    corners.apply(12, 'round');
    expect(node().localName).toBe('rect');
    expect([node().getAttribute('rx'), node().getAttribute('ry')]).toEqual(['12', '12']);
    expect(store.undoLabel()).toBe('Undo Round Corners');
    corners.apply(12, 'chamfer');
    expect(node().localName).toBe('path');
    expect(node().getAttribute('fill')).toBe('red');
    expect(cornerSource(node())).toMatchObject({ type: 'path', radius: 12, kind: 'chamfer' });
    store.undo();
    expect(store.document().node({ asset: 'a.svg', id: 'n1' })!.lastElementChild!.localName).toBe(
      'rect',
    );
  });

  it('a polygon becomes a path whose sharp points stay live; again from them', () => {
    add('<polygon points="0,0 100,0 50,80"/>');
    corners.apply(5, 'round');
    expect(node().localName).toBe('path');
    expect(JSON.parse(node().getAttribute(CORNERS_ATTR)!).points).toEqual([
      [0, 0],
      [100, 0],
      [50, 80],
    ]);
    corners.apply(0, 'round');
    expect(node().getAttribute('d')).toBe('M 0 0 L 100 0 L 50 80 Z');
  });

  it('curved paths and text have no corners', () => {
    add('<path d="M 0 0 C 10 10 20 10 30 0"/>');
    expect(corners.canApply()).toBe(false);
    expect(corners.apply(5, 'round')).toBe(false);
  });
});
