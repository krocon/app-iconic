import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DroppedFile } from '../../core/drop/drop.models';
import { DocumentStore } from '../document/document.store';
import { groups } from '../document/model/icon-json';
import { DROP_OFFSET, dropHintKind, planDrop } from './file-drop';
import { FileDropService } from './file-drop.service';
import { FilesService } from './files.service';

const f = (path: string, kind: DroppedFile['kind']): DroppedFile => ({ path, kind });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>';

describe('planDrop (design 071 E2)', () => {
  it('switches by kind; over the canvas at the point, further files offset', () => {
    const files = [
      f('/a.icon', 'icon'),
      f('/b.svg', 'svg'),
      f('/c.png', 'image'),
      f('/d.pdf', 'other'),
    ];
    expect(planDrop(files, { x: 100, y: 200 })).toEqual([
      { kind: 'open', path: '/a.icon' },
      { kind: 'insertSvg', path: '/b.svg', at: { x: 100, y: 200 } },
      { kind: 'image', path: '/c.png', at: { x: 100 + DROP_OFFSET, y: 200 + DROP_OFFSET } },
      { kind: 'other', path: '/d.pdf' },
    ]);
  });

  it('elsewhere an SVG becomes a new layer, an image goes to the visible centre', () => {
    expect(planDrop([f('/b.svg', 'svg'), f('/c.jpg', 'image')], null)).toEqual([
      { kind: 'importSvg', path: '/b.svg' },
      { kind: 'image', path: '/c.jpg', at: null },
    ]);
  });

  it('names the hint', () => {
    expect(dropHintKind([f('/a.icon', 'icon')], true)).toBe('open');
    expect(dropHintKind([f('/b.svg', 'svg')], true)).toBe('insert');
    expect(dropHintKind([f('/b.svg', 'svg')], false)).toBe('layer');
    expect(dropHintKind([f('/d.pdf', 'other')], true)).toBe('none');
    expect(dropHintKind([], true)).toBe('none');
  });
});

describe('FileDropService (design 071)', () => {
  let backend: ReturnType<typeof fakeBackend>;
  let store: DocumentStore;
  let drop: FileDropService;
  let files: FilesService;

  beforeEach(() => {
    backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    files = TestBed.inject(FilesService);
    files.store.set(store);
    drop = TestBed.inject(FileDropService);
    backend.files.svgFiles.set('/x/b.svg', { name: 'b.svg', text: SVG });
    backend.files.imageFiles.set('/x/c.png', {
      name: 'c.png',
      mime: 'image/png',
      dataUrl: PNG,
      width: 40,
      height: 20,
    });
  });

  it('an image lands centred on the drop point, one undo step per file', async () => {
    await drop.drop([f('/x/c.png', 'image'), f('/x/b.svg', 'svg')], { x: 300, y: 400 });
    const root = store.document().assets.get('a.svg')!.svg!.root;
    const image = root.querySelector('image')!;
    expect([image.getAttribute('x'), image.getAttribute('y')]).toEqual(['280', '390']);
    expect(image.getAttribute('href')).toBe(PNG);
    // the SVG's elements at the next point (no layout in jsdom: they stay where they are)
    expect(root.querySelectorAll('rect[height="20"]').length).toBeGreaterThan(0);
    store.undo();
    expect(root.querySelector('image')).not.toBeNull();
    store.undo();
    expect(store.document().assets.get('a.svg')!.svg!.root.querySelector('image')).toBeNull();
  });

  it('an SVG elsewhere is imported as a new layer; unknown files are reported', async () => {
    const before = groups(store.document().iconJson).length;
    await drop.drop([f('/x/b.svg', 'svg'), f('/x/d.pdf', 'other')], null);
    expect(groups(store.document().iconJson)).toHaveLength(before + 1);
    expect(files.notice()).toContain('One file was not added');
  });

  it('follows the drag: hint, leave, drop', async () => {
    await drop.handle({ phase: 'enter', files: [f('/x/b.svg', 'svg')], x: 5, y: 6 });
    expect(drop.hover()).toEqual({ x: 5, y: 6, kind: 'layer' });
    await drop.handle({ phase: 'leave', files: [], x: 0, y: 0 });
    expect(drop.hover()).toBeNull();
    backend.drop.emit({ phase: 'enter', files: [f('/x/a.icon', 'icon')], x: 1, y: 1 });
    expect(drop.hover()).toBeNull(); // not listening yet
    drop.start();
    await Promise.resolve();
    backend.drop.emit({ phase: 'enter', files: [f('/x/a.icon', 'icon')], x: 1, y: 1 });
    expect(drop.hover()?.kind).toBe('open');
  });
});
