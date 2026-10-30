import { treeDocument } from '../../../testing/tree-documents';
import { editableRefs, isLocked, LOCK_ATTR } from './lock';

describe('lock (prompt 055, 064)', () => {
  it('a locked node and everything inside it is locked', () => {
    const doc = treeDocument();
    const grp = doc.node({ asset: 'a.svg', id: 'n6' })!;
    grp.setAttribute(LOCK_ATTR, 'true');
    expect(isLocked(grp)).toBe(true);
    expect(isLocked(doc.node({ asset: 'a.svg', id: 'n7' })!)).toBe(true);
    expect(isLocked(doc.node({ asset: 'a.svg', id: 'n9' })!)).toBe(false);
  });

  it('tools only change unlocked nodes (prompt 064)', () => {
    const doc = treeDocument();
    doc.node({ asset: 'a.svg', id: 'n6' })!.setAttribute(LOCK_ATTR, 'true');
    const refs = ['n7', 'n9', 'n10', 'gone'].map((id) => ({ asset: 'a.svg', id }));
    expect(editableRefs(doc, refs).map((r) => r.id)).toEqual(['n9', 'n10']);
  });
});
