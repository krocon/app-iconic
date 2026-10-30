import { treeDocument } from '../../../testing/tree-documents';
import { IconDocument } from '../document/icon-document';
import { followUpSelection } from './follow-up';
import {
  ancestorsOfSelection,
  allNodes,
  buildTree,
  domPosition,
  flatten,
  TreeNode,
} from './hierarchy-model';
import { nodeLabel } from './node-label';
import { treeIcon } from './tree-icons';
import { swatchOf } from './swatch';

const labels = (n: TreeNode): unknown => [n.label, ...n.children.map(labels)];
// front-most first (prompt 063): text, path, group – the group's children reversed too
const A = [
  ['Definitions', ['defs · 1', ['lg', ['stop'], ['stop']]]],
  ['text “Hello”'],
  ['path'],
  ['grp', ['circle r 5'], ['rect 10 × 20']],
];

describe('hierarchy model (design 006 E1–E3)', () => {
  it('drop positions on node rows mean the opposite in the DOM (prompt 063)', () => {
    const node = { kind: 'node' as const, ref: { asset: 'a.svg', id: 'n9' } };
    expect(domPosition(node, 'before')).toBe('after');
    expect(domPosition(node, 'after')).toBe('before');
    expect(domPosition(node, 'into')).toBe('into');
    const layer = { kind: 'layer' as const, group: 0, layer: 0 };
    expect(domPosition(layer, 'before')).toBe('before');
  });

  it('builds root → groups → layers → nodes, definitions in their own node', () => {
    const tree = buildTree(treeDocument());
    expect(labels(tree)).toEqual([
      'Icon',
      ['Front', ['A', ...A], ['A2', ...A]],
      ['Group 2', ['B', ['r']], ['P']],
    ]);
    const a = tree.children[0].children[0];
    expect(a.id).toBe('g0/l0');
    expect(a.children.map((c) => c.id)).toEqual([
      'g0/l0/defs',
      'g0/l0/n10',
      'g0/l0/n9',
      'g0/l0/n6',
    ]);
    // paint order for the AI: 0 = back (the defs come first in the DOM)
    expect(a.children.slice(1).map((c) => c.z)).toEqual([3, 2, 1]);
    expect(a.children[3].children[0].id).toBe('g0/l0/n6/n8');
    expect(a.children[0].children[0].definition).toBe(true);
    expect(a.children[1].definition).toBe(false);
    // the same asset in two layers: two rows, one ref
    expect(tree.children[0].children[1].children[3].ref).toEqual({ asset: 'a.svg', id: 'n6' });
    expect([a.container, tree.children[1].children[1].container]).toEqual([true, false]);
  });

  it('flags missing and uneditable images', () => {
    const doc = treeDocument();
    doc.iconJson = { groups: [{ layers: [{ 'image-name': 'gone.svg' }] }] };
    expect(buildTree(doc).children[0].children[0].warning).toBe('missing image');
  });

  it('flattens the open rows with level, position and dimmed children of hidden rows', () => {
    const doc = treeDocument();
    doc.node({ asset: 'a.svg', id: 'n6' })!.setAttribute('display', 'none');
    const tree = buildTree(doc);
    let rows = flatten(tree, new Set());
    expect(rows.map((r) => r.node.id)).toEqual([
      'root',
      'g0',
      'g0/l0',
      'g0/l0/defs',
      'g0/l0/n10',
      'g0/l0/n9',
      'g0/l0/n6',
      'g0/l1',
      'g0/l1/defs',
      'g0/l1/n10',
      'g0/l1/n9',
      'g0/l1/n6',
      'g1',
      'g1/l0',
      'g1/l0/n12',
      'g1/l1',
    ]);
    const grp = rows[6];
    expect([grp.level, grp.posinset, grp.setsize, grp.expanded, grp.node.hidden]).toEqual([
      4,
      4,
      4,
      false,
      true,
    ]);
    expect(rows[1].expanded).toBe(true);
    rows = flatten(tree, new Set(['g0/l0/n6', 'g0']));
    expect(rows.map((r) => r.node.id).slice(0, 4)).toEqual(['root', 'g0', 'g1', 'g1/l0']);
    rows = flatten(tree, new Set(['g0/l0/n6']));
    expect(rows.find((r) => r.node.id === 'g0/l0/n6/n7')!.dimmed).toBe(true);
  });

  it('finds the ancestors of the selection (to reveal it)', () => {
    const tree = buildTree(treeDocument());
    expect(ancestorsOfSelection(tree, [{ asset: 'a.svg', id: 'n7' }], [])).toEqual([
      'root',
      'g0',
      'g0/l0',
      'g0/l0/n6',
      'g0/l1',
      'g0/l1/n6',
    ]);
    expect(ancestorsOfSelection(tree, [], [{ kind: 'layer', group: 1, layer: 0 }])).toEqual([
      'root',
      'g1',
    ]);
  });

  it('names helpers: guide, dimension, construction, live fill – with icons and the stale warning (066)', () => {
    const el = (markup: string) =>
      new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    const NS = 'xmlns="http://www.w3.org/2000/svg"';
    expect(nodeLabel(el(`<line ${NS} data-guide="horizontal" y1="120.004" y2="120"/>`))).toBe(
      'Guide y 120',
    );
    expect(nodeLabel(el(`<line ${NS} data-guide="vertical" x1="30"/>`))).toBe('Guide x 30');
    expect(nodeLabel(el(`<g ${NS} data-dimension="linear" data-value="48"/>`))).toBe(
      'Dimension 48',
    );
    expect(nodeLabel(el(`<circle ${NS} data-construction="" r="3"/>`))).toBe('Construction circle');
    expect(nodeLabel(el(`<path ${NS} data-live-fill="{}"/>`))).toBe('Live fill');
    // an id wins
    expect(nodeLabel(el(`<path ${NS} id="sky" data-live-fill="{}"/>`))).toBe('sky');
    const doc = treeDocument();
    doc.node({ asset: 'a.svg', id: 'n9' })!.setAttribute('data-live-fill', '{}');
    const tree = buildTree(doc, new Set(['a.svg:n9']));
    const fill = allNodes(tree).find((n) => n.id === 'g0/l0/n9')!;
    expect(fill.role).toBe('fill');
    expect(fill.warning).toContain('open');
    expect(treeIcon(fill)).toContain('M3 6l5');
  });

  it('labels nodes by id, else name and a short hint', () => {
    const el = (markup: string) =>
      new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    expect(nodeLabel(el('<ellipse xmlns="http://www.w3.org/2000/svg" rx="5" ry="3"/>'))).toBe(
      'ellipse 5 × 3',
    );
    expect(nodeLabel(el('<use xmlns="http://www.w3.org/2000/svg" href="#a"/>'))).toBe('use → #a');
    expect(
      nodeLabel(
        el('<text xmlns="http://www.w3.org/2000/svg">A very long text that goes on and on</text>'),
      ),
    ).toBe('text “A very long text that g…”');
    expect(
      nodeLabel(el('<rect xmlns="http://www.w3.org/2000/svg" id="x" width="1" height="1"/>')),
    ).toBe('x');
  });
});

describe('swatches (design 006 E3)', () => {
  const doc = treeDocument();
  const root = doc.assets.get('a.svg')!.svg!.root;
  const at = (id: string) => doc.node({ asset: 'a.svg', id })!;

  it('reads colours from attribute or style, none, currentColor, gradients', () => {
    expect(swatchOf(at('n7'), 'fill', root)).toEqual({ kind: 'color', css: 'white' });
    expect(swatchOf(at('n7'), 'stroke', root)).toEqual({ kind: 'none' });
    expect(swatchOf(at('n8'), 'fill', root)).toEqual({ kind: 'color', css: 'rgb(0, 128, 0)' });
    expect(swatchOf(at('n8'), 'stroke', root)).toBeNull();
    expect(swatchOf(at('n9'), 'fill', root)).toEqual({
      kind: 'gradient',
      css: 'linear-gradient(90deg, red 0%, #00f 100%)',
    });
    expect(swatchOf(at('n9'), 'stroke', root)).toEqual({ kind: 'inherit' });
  });

  it('follows href to the stops; unknown url() is a pattern; nothing unsafe gets through', () => {
    const d = IconDocument.fromDto({
      path: null,
      name: null,
      format: 'bundle',
      iconJson: {},
      assets: [
        {
          name: 's.svg',
          kind: 'svg',
          text:
            '<svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="base"><stop stop-color="red" stop-opacity="0.5"/></linearGradient>' +
            '<radialGradient id="ref" href="#base"/><pattern id="p"/>' +
            '<rect fill="url(#ref)"/><rect fill="url(#p)"/><rect fill="expression(alert(1))"/></svg>',
        },
      ],
      warnings: [],
    });
    const r = d.assets.get('s.svg')!.svg!.root;
    const [a, b, c] = [...r.querySelectorAll('rect')];
    expect(swatchOf(a, 'fill', r)).toEqual({
      kind: 'color',
      css: 'color-mix(in srgb, red 50%, transparent)',
    });
    expect(swatchOf(b, 'fill', r)).toEqual({ kind: 'pattern' });
    // the import sanitizer already removes the value (prompt 031): no swatch at all
    expect(c.hasAttribute('fill')).toBe(false);
    expect(swatchOf(c, 'fill', r)).toBeNull();
  });
});

describe('follow-up selection after delete (design 006 E9)', () => {
  const tree = buildTree(treeDocument());
  const n = (id: string) => ({ asset: 'a.svg', id });

  it('next sibling, else previous, else parent', () => {
    expect(followUpSelection(tree, [n('n6')], []).nodes).toEqual([n('n9')]);
    expect(followUpSelection(tree, [n('n9'), n('n10')], []).nodes).toEqual([n('n6')]);
    expect(followUpSelection(tree, [n('n7')], []).nodes).toEqual([n('n8')]);
    expect(followUpSelection(tree, [n('n8')], []).nodes).toEqual([n('n7')]);
    expect(followUpSelection(tree, [n('n7'), n('n8')], []).nodes).toEqual([n('n6')]);
    // inside "Definitions": the layer when nothing else is left
    expect(followUpSelection(tree, [n('n2')], [])).toEqual({
      nodes: [],
      items: [{ kind: 'layer', group: 0, layer: 0 }],
    });
  });

  it('groups and layers get their indices after the deletion', () => {
    expect(followUpSelection(tree, [], [{ kind: 'group', group: 0 }]).items).toEqual([
      { kind: 'group', group: 0 },
    ]);
    expect(followUpSelection(tree, [], [{ kind: 'layer', group: 1, layer: 1 }]).items).toEqual([
      { kind: 'layer', group: 1, layer: 0 },
    ]);
    expect(followUpSelection(tree, [], [{ kind: 'layer', group: 0, layer: 0 }]).items).toEqual([
      { kind: 'layer', group: 0, layer: 0 },
    ]);
    const both = [
      { kind: 'layer', group: 1, layer: 0 },
      { kind: 'layer', group: 1, layer: 1 },
    ] as const;
    expect(followUpSelection(tree, [], [...both]).items).toEqual([{ kind: 'group', group: 1 }]);
  });

  it('every row of the tree is reachable', () => {
    expect(allNodes(tree)).toHaveLength(1 + 2 + 4 + 2 * 10 + 1);
  });
});
