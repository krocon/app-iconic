import { smallDocument } from '../../../testing/documents';
import { InsertNode, SetAttribute } from './commands';
import { DocumentStore } from './document.store';

describe('DocumentStore', () => {
  it('publishes revision, undo labels and dirty', () => {
    const doc = smallDocument();
    const store = new DocumentStore(doc);
    expect([store.revision(), store.dirty(), store.canUndo()]).toEqual([0, false, false]);
    store.execute(new SetAttribute({ asset: 'a.svg', id: 'n3' }, 'fill', 'blue'));
    expect(store.revision()).toBe(1);
    expect(store.document()).toBe(doc);
    expect([store.dirty(), store.undoLabel(), store.redoLabel()]).toEqual([
      true,
      'Undo Change Attribute',
      'Redo',
    ]);
    store.undo();
    expect([store.dirty(), store.canRedo(), store.revision()]).toEqual([false, true, 2]);
  });

  it('drops selected nodes that undo removed', () => {
    const store = new DocumentStore(smallDocument());
    const insert = new InsertNode({ asset: 'a.svg', id: 'n2' }, '<rect/>');
    store.execute(insert);
    store.selection.set([insert.ref!, { asset: 'a.svg', id: 'n3' }]);
    store.undo();
    expect(store.selection()).toEqual([{ asset: 'a.svg', id: 'n3' }]);
    store.redo();
    expect(store.selection()).toEqual([{ asset: 'a.svg', id: 'n3' }]);
  });

  it('is pristine only as an untouched new document; saving sets title and save point', () => {
    const store = new DocumentStore(smallDocument(null));
    expect([store.pristine(), store.title()]).toEqual([true, null]);
    store.execute(new SetAttribute({ asset: 'a.svg', id: 'n3' }, 'fill', 'blue'));
    expect(store.pristine()).toBe(false);
    store.markSaved({ path: '/n.icon', name: 'n.icon', format: 'zip' });
    expect([store.dirty(), store.title(), store.pristine()]).toEqual([false, 'n.icon', false]);
  });
});
