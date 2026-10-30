import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import {
  CompositeCommand,
  InsertNode,
  RemoveNode,
  ReplaceNode,
  SetAttributes,
} from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { constraintHousekeeping } from './constraint-housekeeping';
import { ConstraintFollower } from './constraint-follower';
import { CID_ATTR, metadataOf, readConstraints } from './constraint-storage';
import { ConstraintService } from './constraint.service';

describe('constraints after every change (prompt 065)', () => {
  let store: DocumentStore;
  let service: ConstraintService;
  let follower: ConstraintFollower;
  const root = () => store.document().node({ asset: 'a.svg', id: 'n1' })!;
  const add = (markup: string): NodeRef => {
    store.execute(new InsertNode({ asset: 'a.svg', id: 'n1' }, markup));
    return store.document().refOf(root().lastElementChild!)!;
  };
  const el = (r: NodeRef) => store.document().node(r)!;
  const list = () => readConstraints(root()).map((c) => [c.type, ...c.refs]);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
    });
    store = new DocumentStore(treeDocument());
    TestBed.inject(FilesService).store.set(store);
    service = TestBed.inject(ConstraintService);
    follower = TestBed.inject(ConstraintFollower);
    TestBed.tick(); // the effect registers the followers
  });

  it('nothing to do in an orderly document', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="10"/>');
    service.add('horizontal', [{ node: a, part: 'line' }]);
    expect(constraintHousekeeping(store.document())).toBeNull();
  });

  it('deleting a constrained element removes its constraints in the same undo step', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="10"/>');
    const b = add('<line x1="0" y1="50" x2="50" y2="90"/>');
    service.add('horizontal', [{ node: a, part: 'line' }]);
    service.add('parallel', [
      { node: a, part: 'line' },
      { node: b, part: 'line' },
    ]);
    service.add('length', [{ node: b, part: 'line' }]);
    store.execute(new RemoveNode(a));
    expect(list()).toEqual([['length', 'c2.line']]);
    expect(TestBed.inject(FilesService).notice()).toContain('2 constraints were removed');
    store.undo();
    expect(list()).toHaveLength(3);
    store.execute(new RemoveNode(b));
    store.execute(new RemoveNode(a));
    expect(metadataOf(root())).toBeNull();
  });

  it('a rect replaced by a path (Corners, Trim …) loses its constraints', () => {
    const r = add('<rect x="10" y="20" width="100" height="50"/>');
    service.add('length', [{ node: r, part: 'top' }]);
    store.execute(new ReplaceNode(r, '<path data-cid="c1" d="M10 20h100v50h-100z"/>'));
    expect(list()).toEqual([]);
  });

  it('a duplicate gets a fresh cid and the constraints among the copies', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="0"/>');
    const b = add('<line x1="0" y1="50" x2="100" y2="50"/>');
    service.add('horizontal', [{ node: a, part: 'line' }]);
    service.add('equal', [
      { node: a, part: 'line' },
      { node: b, part: 'line' },
    ]);
    service.add('fix', [{ node: a, part: 'p1' }]);
    // a copy of both in one step (like Duplicate): same cids, after the originals
    const markup = (r: NodeRef) => el(r).outerHTML.replace(/ data-ai-id="[^"]*"/, '');
    const parent = { asset: 'a.svg', id: 'n1' };
    store.execute(
      new CompositeCommand('paste', [
        new InsertNode(parent, markup(a)),
        new InsertNode(parent, markup(b)),
      ]),
    );
    const a2 = store.document().refOf(root().children[root().children.length - 2])!;
    const b2 = store.document().refOf(root().lastElementChild!)!;
    expect(el(a).getAttribute(CID_ATTR)).toBe('c1');
    expect(el(a2).getAttribute(CID_ATTR)).toBe('c3');
    expect(el(b2).getAttribute(CID_ATTR)).toBe('c4');
    expect(list()).toEqual([
      ['horizontal', 'c1.line'],
      ['equal', 'c1.line', 'c2.line'],
      ['fix', 'c1.p1'],
      ['horizontal', 'c3.line'],
      ['equal', 'c3.line', 'c4.line'],
    ]);
  });

  it('auto-solve keeps the relations after a free change (one undo step)', () => {
    const a = add('<line x1="0" y1="0" x2="100" y2="0"/>');
    service.add('horizontal', [{ node: a, part: 'line' }]);
    service.add('length', [{ node: a, part: 'line' }]);
    store.execute(new SetAttributes([{ ref: a, name: 'y2', value: '40' }]));
    expect(service.holds('a.svg')).toBe(false);
    expect(service.broken('a.svg')).toHaveLength(2);
    store.undo();
    follower.autoSolve.set(true);
    store.execute(new SetAttributes([{ ref: a, name: 'y2', value: '40' }]));
    expect(service.holds('a.svg')).toBe(true);
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((n) => Number(el(a).getAttribute(n)));
    expect(y1).toBeCloseTo(y2, 3);
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(100, 2);
    store.undo();
    expect(el(a).getAttribute('y2')).toBe('0');
  });
});
