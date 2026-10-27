import { treeDocument } from '../../../testing/tree-documents';
import { IconDocument } from '../document/icon-document';
import { Selection } from '../hierarchy/follow-up';
import { currentGroupIndex, insertTarget, layerOfAsset } from './insert-target';

const a = (id: string) => ({ asset: 'a.svg', id });
const b = (id: string) => ({ asset: 'b.svg', id });
const nodes = (...refs: { asset: string; id: string }[]): Selection => ({ nodes: refs, items: [] });
const NONE: Selection = { nodes: [], items: [] };

describe('insertTarget (design 008 E2)', () => {
  const doc = treeDocument();
  it.each<[string, Selection, ReturnType<typeof insertTarget>]>([
    [
      'selected container → into, at the end',
      nodes(a('n6')),
      { kind: 'node', parent: a('n6'), index: 2 },
    ],
    [
      'selected shape → right after it',
      nodes(a('n7')),
      { kind: 'node', parent: a('n6'), index: 1 },
    ],
    [
      'several → after the last (document order)',
      nodes(a('n9'), a('n7')),
      { kind: 'node', parent: a('n1'), index: 3 },
    ],
    ['inside defs → after the defs', nodes(a('n4')), { kind: 'node', parent: a('n1'), index: 1 }],
    ['defs itself → after it', nodes(a('n2')), { kind: 'node', parent: a('n1'), index: 1 }],
    ['asset root → into it', nodes(a('n1')), { kind: 'node', parent: a('n1'), index: 4 }],
    [
      'layer → end of its asset',
      { nodes: [], items: [{ kind: 'layer', group: 1, layer: 0 }] },
      { kind: 'node', parent: b('n11'), index: 1 },
    ],
    [
      'group → its first layer',
      { nodes: [], items: [{ kind: 'group', group: 1 }] },
      { kind: 'node', parent: b('n11'), index: 1 },
    ],
    ['nothing → first layer of the first group', NONE, { kind: 'node', parent: a('n1'), index: 4 }],
    [
      'root item → like nothing',
      { nodes: [], items: [{ kind: 'root' }] },
      { kind: 'node', parent: a('n1'), index: 4 },
    ],
  ])('%s', (_, sel, expected) => {
    expect(insertTarget(doc, sel)).toEqual(expected);
  });

  it('uses the canvas group context when nothing is selected', () => {
    expect(insertTarget(doc, NONE, a('n6'))).toEqual({ kind: 'node', parent: a('n6'), index: 2 });
    // a context that paints nothing does not count
    expect(insertTarget(doc, NONE, a('n2'))).toEqual({ kind: 'node', parent: a('n1'), index: 4 });
  });

  it('skips layers without an editable SVG; none at all → a new group', () => {
    const d = treeDocument();
    d.iconJson = {
      groups: [{ layers: [{ 'image-name': 'p.png', name: 'P' }] }, ...d.iconJson.groups!.slice(1)],
    };
    expect(insertTarget(d, NONE)).toEqual({ kind: 'node', parent: b('n11'), index: 1 });
    const empty = new IconDocument();
    expect(insertTarget(empty, NONE)).toEqual({ kind: 'newGroup' });
    d.iconJson = { groups: [{ layers: [{ 'image-name': 'p.png', name: 'P' }] }] };
    expect(insertTarget(d, NONE)).toEqual({ kind: 'newGroup' });
  });

  it('finds the group of the current layer', () => {
    expect(layerOfAsset(doc, 'b.svg')).toEqual({ group: 1, layer: 0 });
    expect(layerOfAsset(doc, 'x.svg')).toBeNull();
    expect(currentGroupIndex(doc, nodes(b('n12')))).toBe(1);
    expect(
      currentGroupIndex(doc, { nodes: [], items: [{ kind: 'layer', group: 1, layer: 1 }] }),
    ).toBe(1);
    expect(currentGroupIndex(doc, NONE)).toBe(0);
    expect(currentGroupIndex(new IconDocument(), NONE)).toBeNull();
  });
});
