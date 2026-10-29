import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { InsertNode } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { CID_ATTR, metadataOf, readConstraints, stripConstraints } from './constraint-storage';
import { ConstraintService } from './constraint.service';

describe('ConstraintService (prompt 059)', () => {
  let store: DocumentStore;
  let service: ConstraintService;
  const root = () => store.document().node({ asset: 'a.svg', id: 'n1' })!;
  const add = (markup: string): NodeRef => {
    store.execute(new InsertNode({ asset: 'a.svg', id: 'n1' }, markup));
    return store.document().refOf(root().lastElementChild!)!;
  };
  const el = (r: NodeRef) => store.document().node(r)!;
  const attrs = (r: NodeRef, ...names: string[]) => names.map((n) => el(r).getAttribute(n));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    service = TestBed.inject(ConstraintService);
  });

  it('a driving dimension: the rectangle follows its value (one undo step each)', () => {
    const r = add('<rect x="10" y="20" width="100" height="50"/>');
    expect(service.add('fix', [{ node: r, part: 'tl' }])).toBe(true);
    expect(service.add('length', [{ node: r, part: 'top' }])).toBe(true);
    expect(el(r).getAttribute(CID_ATTR)).toBe('c1');
    const list = service.list('a.svg');
    expect(list.map((c) => [c.type, c.refs, c.value])).toEqual([
      ['fix', ['c1.tl'], undefined],
      ['length', ['c1.top'], 100],
    ]);
    expect(service.setValue('a.svg', list[1].id, 240)).toBe(true);
    expect(attrs(r, 'x', 'y', 'width', 'height')).toEqual(['10', '20', '240', '50']);
    expect(store.undoLabel()).toBe('Undo Change Dimension');
    store.undo();
    expect(attrs(r, 'width')).toEqual(['100']);
    store.undo();
    store.undo();
    expect(metadataOf(root())).toBeNull();
    expect(el(r).hasAttribute(CID_ATTR)).toBe(false);
  });

  it('a relation moves what it needs to and is stored; a contradiction is refused', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="10"/>');
    const b = add('<line x1="0" y1="50" x2="50" y2="90"/>');
    expect(service.add('horizontal', [{ node: a, part: 'line' }])).toBe(true);
    expect(Number(el(a).getAttribute('y1'))).toBeCloseTo(Number(el(a).getAttribute('y2')), 3);
    expect(
      service.add('parallel', [
        { node: a, part: 'line' },
        { node: b, part: 'line' },
      ]),
    ).toBe(true);
    expect(Number(el(b).getAttribute('y1'))).toBeCloseTo(Number(el(b).getAttribute('y2')), 3);
    expect(service.add('vertical', [{ node: b, part: 'line' }])).toBe('conflict');
    expect(service.list('a.svg')).toHaveLength(2);
    expect(service.add('tangent', [{ node: a, part: 'line' }])).toBe('invalid');
    // removing frees it again
    const id = service.list('a.svg')[1].id;
    expect(service.remove('a.svg', id)).toBe(true);
    expect(service.add('vertical', [{ node: b, part: 'line' }])).toBe(true);
  });

  it('dragging a point keeps the constraints; one undo step', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="0"/>');
    service.add('horizontal', [{ node: a, part: 'line' }]);
    service.add('length', [{ node: a, part: 'line' }]);
    service.dragBegin('a.svg', 'c1.p2');
    service.dragTo({ x: 150, y: 40 });
    service.dragTo({ x: 160, y: 60 });
    service.dragEnd();
    const [x1, y1, x2, y2] = attrs(a, 'x1', 'y1', 'x2', 'y2').map(Number);
    expect(y1).toBeCloseTo(y2, 3);
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(100, 2);
    expect(x2).toBeCloseTo(160, 2);
    expect(y2).toBeCloseTo(60, 2);
    expect(store.undoLabel()).toBe('Undo Move Constrained Point');
    store.undo();
    expect(attrs(a, 'x2', 'y2')).toEqual(['100', '0']);
  });

  it('a free edit is brought back by solving; the export strips everything', () => {
    const c = add('<circle cx="50" cy="50" r="10"/>');
    service.add('radius', [{ node: c, part: 'circle' }], 25);
    expect(el(c).getAttribute('r')).toBe('25');
    el(c).setAttribute('r', '40');
    expect(service.holds('a.svg')).toBe(false);
    expect(service.solveAsset('a.svg')).toBe(true);
    expect(el(c).getAttribute('r')).toBe('25');
    const copy = root().cloneNode(true) as Element;
    stripConstraints(copy);
    expect(copy.querySelector('metadata')).toBeNull();
    expect(copy.querySelector(`[${CID_ATTR}]`)).toBeNull();
    expect(readConstraints(root())).toHaveLength(1);
  });
});
