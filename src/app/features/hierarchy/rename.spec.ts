import { treeDocument } from '../../../testing/tree-documents';
import { DocumentStore } from '../document/document.store';
import { buildTree } from './hierarchy-model';
import { renameElementCommand } from './rename';
import { filterTree, highlight, toggledFor } from './tree-filter';
import { itemLockRefs, isLocked } from '../lock/lock';
import { lockCommand } from '../lock/lock';

const a = (id: string) => ({ asset: 'a.svg', id });

describe('rename an element (prompt 072 E1)', () => {
  it('renames the id and every reference; one undo step', () => {
    const store = new DocumentStore(treeDocument());
    const cmd = renameElementCommand(store.document(), a('n3'), 'sky');
    expect(typeof cmd).toBe('object');
    store.execute(cmd as never);
    const doc = store.document();
    expect(doc.node(a('n3'))!.getAttribute('id')).toBe('sky');
    expect(doc.node(a('n9'))!.getAttribute('fill')).toBe('url(#sky)');
    expect(store.undoLabel()).toBe('Undo Rename Element');
    store.undo();
    expect(store.document().node(a('n9'))!.getAttribute('fill')).toBe('url(#lg)');
  });

  it('refuses invalid, taken and – while referenced – empty names', () => {
    const doc = treeDocument();
    expect(renameElementCommand(doc, a('n3'), 'two words')).toBe('invalid');
    expect(renameElementCommand(doc, a('n3'), '1st')).toBe('invalid');
    expect(renameElementCommand(doc, a('n3'), 'grp')).toBe('taken');
    expect(renameElementCommand(doc, a('n3'), '')).toBe('referenced');
    expect(renameElementCommand(doc, a('n3'), ' lg ')).toBeNull();
    // an element without references may lose its name; a new one gets one
    expect(typeof renameElementCommand(doc, a('n6'), '')).toBe('object');
    expect(typeof renameElementCommand(doc, a('n7'), 'box')).toBe('object');
  });
});

describe('filter the tree (prompt 072 E2)', () => {
  it('shows matches with their ancestors, all open', () => {
    const tree = buildTree(treeDocument());
    const f = filterTree(tree, 'CIRCLE');
    expect(f.matches.length).toBe(2); // the circle in both layers sharing a.svg
    const ids = f.rows.map((r) => r.node.id);
    expect(ids.slice(0, 4)).toEqual(['root', 'g0', 'g0/l0', 'g0/l0/n6']);
    expect(f.rows.every((r) => r.expanded !== false)).toBe(true);
    expect(filterTree(tree, 'grp').matches).toEqual(['g0/l0/n6', 'g0/l1/n6']);
    expect(filterTree(tree, 'nothing here').rows).toEqual([]);
    expect(filterTree(tree, 'front').matches).toEqual(['g0']);
  });

  it('cuts the label for the highlight; expand / collapse all', () => {
    expect(highlight('rect 10 × 20', 'RECT')).toEqual({
      before: '',
      match: 'rect',
      after: ' 10 × 20',
    });
    expect(highlight('rect', 'x')).toBeNull();
    const tree = buildTree(treeDocument());
    expect(toggledFor(tree, false).has('g0')).toBe(true);
    expect(toggledFor(tree, false).has('g0/l0/n6')).toBe(false);
    expect(toggledFor(tree, true).has('g0/l0/n6')).toBe(true);
    expect(toggledFor(tree, true).has('g0')).toBe(false);
  });
});

describe('lock groups and layers (prompt 072 E5)', () => {
  it('locks the asset root: every child is locked, the rows show it', () => {
    const store = new DocumentStore(treeDocument());
    const refs = itemLockRefs(store.document(), [{ kind: 'group', group: 1 }]);
    expect(refs).toEqual([{ asset: 'b.svg', id: 'n11' }]); // p.png has no SVG
    store.execute(lockCommand(store.document(), refs)!);
    const doc = store.document();
    expect(isLocked(doc.node({ asset: 'b.svg', id: 'n12' })!)).toBe(true);
    const tree = buildTree(doc);
    expect(tree.children[1].locked).toBe(true);
    expect(tree.children[1].children[0].locked).toBe(true);
    expect(tree.children[0].locked).toBeUndefined();
    // a layer of a shared asset: both layers show it
    const now = store.document();
    const refs2 = itemLockRefs(now, [{ kind: 'layer', group: 0, layer: 1 }]);
    expect(refs2).toEqual([{ asset: 'a.svg', id: 'n1' }]);
    store.execute(lockCommand(now, refs2)!);
    expect(buildTree(store.document()).children[0].locked).toBe(true);
  });
});
