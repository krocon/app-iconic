import { IconDocument } from '../icon-document';
import { GroupNodes, ReorderNode, Ungroup } from '../commands';
import { serializeAsset } from '../svg/node-ids';
import { groups, layers } from './icon-json';
import { checkReorder, isDefinitionElement } from './reorder-rules';
import { TreeTarget } from './selection';

const svg = (body: string) => ({
  kind: 'svg' as const,
  text: `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
});

/**
 * The tree of the old app's `TreeReorderServiceTests` (root → GroupA [A1, A2], GroupB [B1]) as
 * groups and layers, plus SVG nodes: a.svg = n1 svg → n2 g → (n3 rect, n4 circle), n5 path;
 * b.svg = n6 svg → n7 rect.
 */
function tree(): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: {
      groups: [
        {
          name: 'GroupA',
          layers: [
            { name: 'A1', 'image-name': 'a.svg' },
            { name: 'A2', 'image-name': 'a.svg' },
          ],
        },
        { name: 'GroupB', layers: [{ name: 'B1', 'image-name': 'b.svg' }] },
      ],
    },
    assets: [
      { name: 'a.svg', ...svg('<g><rect/><circle/></g><path/>') },
      { name: 'b.svg', ...svg('<rect/>') },
    ],
    warnings: [],
  });
}

const group = (g: number): TreeTarget => ({ kind: 'group', group: g });
const layer = (g: number, l: number): TreeTarget => ({ kind: 'layer', group: g, layer: l });
const node = (asset: string, id: string): TreeTarget => ({ kind: 'node', ref: { asset, id } });
const names = (doc: IconDocument) =>
  groups(doc.iconJson).map((g) => [g['name'], ...layers(g).map((l) => l.name)]);
const kids = (doc: IconDocument, asset: string, id: string) =>
  Array.from(doc.node({ asset, id })!.children).map((e) => e.getAttribute('data-ai-id'));

describe('reorder rules (TreeReorderServiceTests of the old app, design 006 E6)', () => {
  it('cannot move the root (here: the root of an asset)', () => {
    expect(checkReorder(tree(), [node('a.svg', 'n1')], node('b.svg', 'n7'), 'before')).toBe(
      'cannotMoveRoot',
    );
    expect(checkReorder(tree(), [node('a.svg', 'n5')], node('b.svg', 'n6'), 'before')).toBe(
      'cannotMoveRoot',
    );
  });

  it('groups only reorder under the root', () => {
    const doc = tree();
    expect(checkReorder(doc, [group(0)], group(1), 'into')).toBe('topLevelGroupRestriction');
    expect(checkReorder(doc, [group(0)], layer(1, 0), 'before')).toBe('topLevelGroupRestriction');
    const cmd = new ReorderNode([group(1)], group(0), 'before');
    cmd.do(doc);
    expect(names(doc)).toEqual([
      ['GroupB', 'B1'],
      ['GroupA', 'A1', 'A2'],
    ]);
    expect(cmd.moved).toEqual([group(0)]);
  });

  it('moves into a container', () => {
    const doc = tree();
    const cmd = new ReorderNode([layer(0, 0)], group(1), 'into');
    cmd.do(doc);
    expect(names(doc)).toEqual([
      ['GroupA', 'A2'],
      ['GroupB', 'B1', 'A1'],
    ]);
    expect(cmd.moved).toEqual([layer(1, 1)]);
    cmd.undo(doc);
    expect(names(doc)[0]).toEqual(['GroupA', 'A1', 'A2']);
  });

  it('cannot move into a non-container', () => {
    const doc = tree();
    expect(checkReorder(doc, [layer(0, 1)], layer(1, 0), 'into')).toBe('parentNotContainer');
    expect(checkReorder(doc, [node('a.svg', 'n5')], node('a.svg', 'n3'), 'into')).toBe(
      'parentNotContainer',
    );
    expect(checkReorder(doc, [layer(0, 1)], group(1), 'before')).toBe('parentNotContainer');
    expect(checkReorder(doc, [node('a.svg', 'n5')], group(1), 'into')).toBe('parentNotContainer');
  });

  it('reparents across groups', () => {
    const doc = tree();
    new ReorderNode([layer(0, 1)], layer(1, 0), 'before').do(doc);
    expect(names(doc)).toEqual([
      ['GroupA', 'A1'],
      ['GroupB', 'A2', 'B1'],
    ]);
  });

  it('never moves a node into itself or its descendants', () => {
    const doc = tree();
    expect(checkReorder(doc, [node('a.svg', 'n2')], node('a.svg', 'n2'), 'into')).toBe(
      'cycleDetected',
    );
    expect(checkReorder(doc, [node('a.svg', 'n2')], node('a.svg', 'n3'), 'after')).toBe(
      'cycleDetected',
    );
  });

  it('rejects mixed sources, unknown ones and moves that change nothing', () => {
    const doc = tree();
    expect(checkReorder(doc, [group(0), layer(0, 0)], group(1), 'after')).toBe('mixedSources');
    expect(checkReorder(doc, [group(5)], group(1), 'after')).toBe('unknownSource');
    expect(checkReorder(doc, [group(0)], group(5), 'after')).toBe('unknownTarget');
    expect(checkReorder(doc, [group(0)], group(1), 'before')).toBe('sameLocation');
    expect(checkReorder(doc, [node('a.svg', 'n3')], node('a.svg', 'n4'), 'before')).toBe(
      'sameLocation',
    );
    expect(checkReorder(doc, [node('a.svg', 'n4')], node('a.svg', 'n2'), 'into')).toBe(
      'sameLocation',
    );
    expect(() => new ReorderNode([group(0)], group(1), 'before').do(doc)).toThrow(/sameLocation/);
  });

  it('moves several nodes keeping their order, before / after / into', () => {
    const doc = tree();
    const two = [node('a.svg', 'n3'), node('a.svg', 'n4')];
    new ReorderNode(two, node('a.svg', 'n5'), 'after').do(doc);
    expect(kids(doc, 'a.svg', 'n1')).toEqual(['n2', 'n5', 'n3', 'n4']);
    new ReorderNode(two, node('a.svg', 'n2'), 'into').do(doc);
    expect(kids(doc, 'a.svg', 'n2')).toEqual(['n3', 'n4']);
    new ReorderNode([node('a.svg', 'n5'), node('a.svg', 'n4')], node('a.svg', 'n3'), 'before').do(
      doc,
    );
    expect(kids(doc, 'a.svg', 'n2')).toEqual(['n4', 'n5', 'n3']);
  });

  it('a source inside another source just moves along', () => {
    const doc = tree();
    const cmd = new ReorderNode(
      [node('a.svg', 'n2'), node('a.svg', 'n3')],
      node('a.svg', 'n5'),
      'after',
    );
    cmd.do(doc);
    expect(kids(doc, 'a.svg', 'n1')).toEqual(['n5', 'n2']);
    expect(kids(doc, 'a.svg', 'n2')).toEqual(['n3', 'n4']);
    expect(cmd.moved).toEqual([node('a.svg', 'n2')]);
  });

  it('moves a node into another asset (into a layer = end of its root)', () => {
    const doc = tree();
    const before = doc.snapshot();
    const cmd = new ReorderNode([node('a.svg', 'n5')], layer(1, 0), 'into');
    cmd.do(doc);
    expect(kids(doc, 'b.svg', 'n6')).toEqual(['n7', 'n5']);
    expect(cmd.moved).toEqual([node('b.svg', 'n5')]);
    expect(serializeAsset(doc.assets.get('a.svg')!.svg!)).not.toContain('path');
    cmd.undo(doc);
    expect(doc.snapshot()).toBe(before);
  });

  it('knows definitions', () => {
    const doc = IconDocument.fromDto({
      path: null,
      name: null,
      format: 'bundle',
      iconJson: {},
      assets: [
        { name: 'd.svg', ...svg('<defs><linearGradient><stop/></linearGradient></defs><g/>') },
      ],
      warnings: [],
    });
    const el = (id: string) => doc.node({ asset: 'd.svg', id })!;
    expect(['n2', 'n3', 'n4', 'n5'].map((id) => isDefinitionElement(el(id)))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('Group <g> and Ungroup (design 006 E11)', () => {
  it('groups nodes at the place of the first one, in document order', () => {
    const doc = tree();
    const before = doc.snapshot();
    const cmd = new GroupNodes([
      { asset: 'a.svg', id: 'n5' },
      { asset: 'a.svg', id: 'n2' },
    ]);
    cmd.do(doc);
    const g = cmd.ref!;
    expect(kids(doc, 'a.svg', 'n1')).toEqual([g.id]);
    expect(kids(doc, 'a.svg', g.id)).toEqual(['n2', 'n5']);
    cmd.undo();
    expect(doc.snapshot()).toBe(before);
    expect(() =>
      new GroupNodes([
        { asset: 'a.svg', id: 'n5' },
        { asset: 'b.svg', id: 'n7' },
      ]).do(doc),
    ).toThrow();
  });

  it('ungroups a plain <g>, its transform goes in front of the children', () => {
    const doc = tree();
    const g = doc.node({ asset: 'a.svg', id: 'n2' })!;
    g.setAttribute('transform', 'translate(5 5)');
    doc.node({ asset: 'a.svg', id: 'n4' })!.setAttribute('transform', 'scale(2)');
    const before = doc.snapshot();
    const cmd = new Ungroup({ asset: 'a.svg', id: 'n2' });
    cmd.do(doc);
    expect(kids(doc, 'a.svg', 'n1')).toEqual(['n3', 'n4', 'n5']);
    expect(doc.node({ asset: 'a.svg', id: 'n3' })!.getAttribute('transform')).toBe(
      'translate(5 5)',
    );
    expect(doc.node({ asset: 'a.svg', id: 'n4' })!.getAttribute('transform')).toBe(
      'translate(5 5) scale(2)',
    );
    expect(cmd.childRefs().map((r) => r.id)).toEqual(['n3', 'n4']);
    cmd.undo();
    expect(doc.snapshot()).toBe(before);
    g.setAttribute('fill', 'red');
    expect(() => new Ungroup({ asset: 'a.svg', id: 'n2' }).do(doc)).toThrow();
  });
});
