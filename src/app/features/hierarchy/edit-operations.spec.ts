import { treeDocument } from '../../../testing/tree-documents';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { serializeAsset } from '../document/svg/node-ids';
import {
  backCommand,
  frontCommand,
  groupCommand,
  moveCommand,
  ungroupCommand,
} from './arrange-operations';
import { parseSelection } from './edit-actions';
import { deleteCommand, duplicateCommand } from './edit-operations';
import { Selection } from './follow-up';
import { parseClipboard, pasteCommand } from './paste';
import { visibilityCommand } from './visibility';

const a = (id: string) => ({ asset: 'a.svg', id });
const nodes = (...ids: string[]): Selection => ({ nodes: ids.map(a), items: [] });
const kids = (doc: IconDocument, id: string) =>
  Array.from(doc.node(a(id))!.children).map((e) => e.getAttribute('data-ai-id'));
const layerNames = (doc: IconDocument) =>
  groups(doc.iconJson).map((g) => layers(g).map((l) => l.name));

/** do → state, undo → identical to before. */
function roundTrip(doc: IconDocument, run: (s: DocumentStore) => void, check: () => void) {
  const store = new DocumentStore(doc);
  const before = doc.snapshot();
  run(store);
  check();
  store.undo();
  expect(doc.snapshot()).toBe(before);
}

describe('delete (design 006 E9)', () => {
  it('removes the top-level nodes, never an asset root', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => s.execute(deleteCommand(doc, nodes('n6', 'n7', 'n9'))!),
      () => expect(kids(doc, 'n1')).toEqual(['n2', 'n10']),
    );
    expect(deleteCommand(doc, nodes('n1'))).toBeNull();
  });

  it('removes groups and layers and the assets nobody uses any more', () => {
    const doc = treeDocument();
    // the first layer of a.svg goes: the second still uses it
    roundTrip(
      doc,
      (s) =>
        s.execute(
          deleteCommand(doc, { nodes: [], items: [{ kind: 'layer', group: 0, layer: 0 }] })!,
        ),
      () => expect([...doc.assets.keys()]).toEqual(['a.svg', 'b.svg', 'p.png']),
    );
    roundTrip(
      doc,
      (s) =>
        s.execute(
          deleteCommand(doc, {
            nodes: [],
            items: [
              { kind: 'group', group: 0 },
              { kind: 'layer', group: 1, layer: 1 },
            ],
          })!,
        ),
      () => {
        expect(layerNames(doc)).toEqual([['B']]);
        expect([...doc.assets.keys()]).toEqual(['b.svg']);
      },
    );
    expect(deleteCommand(doc, { nodes: [], items: [{ kind: 'root' }] })).toBeNull();
  });
});

describe('duplicate (design 006 E10)', () => {
  it('copies nodes right after the originals with unique ids', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => {
        const p = duplicateCommand(doc, nodes('n6', 'n9'))!;
        s.execute(p.command);
        const sel = p.selection();
        expect(sel.nodes).toHaveLength(2);
        const [g, path] = sel.nodes.map((r) => doc.node(r)!);
        expect(g.getAttribute('id')).toBe('grp-2');
        expect(path.getAttribute('fill')).toBe('url(#lg)');
        expect(kids(doc, 'n1')).toEqual([
          'n2',
          'n6',
          g.getAttribute('data-ai-id'),
          'n9',
          path.getAttribute('data-ai-id'),
          'n10',
        ]);
        expect(serializeAsset(doc.assets.get('a.svg')!.svg!)).not.toMatch(/<g[^>]*xmlns=/);
      },
      () => undefined,
    );
  });

  it('copies a layer with its own copy of the asset', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => {
        const p = duplicateCommand(doc, {
          nodes: [],
          items: [
            { kind: 'layer', group: 0, layer: 0 },
            { kind: 'layer', group: 1, layer: 1 },
          ],
        })!;
        s.execute(p.command);
        expect(layerNames(doc)).toEqual([
          ['A', 'A 2', 'A2'],
          ['B', 'P', 'P 2'],
        ]);
        const copy = layers(groups(doc.iconJson)[0])[1];
        expect(copy['image-name']).toBe('a 2.svg');
        // PNG assets are shared
        expect(layers(groups(doc.iconJson)[1])[2]['image-name']).toBe('p.png');
        expect(serializeAsset(doc.assets.get('a 2.svg')!.svg!)).toBe(
          serializeAsset(doc.assets.get('a.svg')!.svg!),
        );
        expect(p.selection().items).toEqual([
          { kind: 'layer', group: 0, layer: 1 },
          { kind: 'layer', group: 1, layer: 2 },
        ]);
      },
      () => undefined,
    );
  });

  it('copies groups with their layers', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => {
        const p = duplicateCommand(doc, {
          nodes: [],
          items: [
            { kind: 'group', group: 0 },
            { kind: 'group', group: 1 },
          ],
        })!;
        s.execute(p.command);
        expect(groups(doc.iconJson).map((g) => g['name'])).toEqual([
          'Front',
          'Front',
          undefined,
          undefined,
        ]);
        expect(p.selection().items).toEqual([
          { kind: 'group', group: 1 },
          { kind: 'group', group: 3 },
        ]);
      },
      () => undefined,
    );
  });
});

describe('arrange (design 006 E2, E6, E11)', () => {
  it('Bring to Front / Send to Back: nodes to the end / start, groups and layers to 0 / end', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => s.execute(frontCommand(doc, nodes('n6'))!),
      () => expect(kids(doc, 'n1')).toEqual(['n2', 'n9', 'n10', 'n6']),
    );
    roundTrip(
      doc,
      (s) => s.execute(backCommand(doc, nodes('n10', 'n9'))!),
      () => expect(kids(doc, 'n1')).toEqual(['n9', 'n10', 'n2', 'n6']),
    );
    expect(frontCommand(doc, nodes('n10'))).toBeNull();
    expect(frontCommand(doc, nodes('n9', 'n10'))).toBeNull();
    roundTrip(
      doc,
      (s) => s.execute(frontCommand(doc, { nodes: [], items: [{ kind: 'group', group: 1 }] })!),
      () => expect(groups(doc.iconJson)[0]['name']).toBeUndefined(),
    );
    roundTrip(
      doc,
      (s) =>
        s.execute(backCommand(doc, { nodes: [], items: [{ kind: 'layer', group: 0, layer: 0 }] })!),
      () => expect(layerNames(doc)[0]).toEqual(['A2', 'A']),
    );
  });

  it('Move Up / Down / Into / Out', () => {
    const doc = treeDocument();
    // the definitions folder is not a sibling in the tree: n6 cannot move up
    expect(moveCommand(doc, nodes('n6'), 'up')).toBeNull();
    roundTrip(
      doc,
      (s) => s.execute(moveCommand(doc, nodes('n9'), 'up')!),
      () => expect(kids(doc, 'n1')).toEqual(['n2', 'n9', 'n6', 'n10']),
    );
    roundTrip(
      doc,
      (s) => s.execute(moveCommand(doc, nodes('n6'), 'down')!),
      () => expect(kids(doc, 'n1')).toEqual(['n2', 'n9', 'n6', 'n10']),
    );
    roundTrip(
      doc,
      (s) => s.execute(moveCommand(doc, nodes('n9'), 'into')!),
      () => expect(kids(doc, 'n6')).toEqual(['n7', 'n8', 'n9']),
    );
    roundTrip(
      doc,
      (s) => s.execute(moveCommand(doc, nodes('n7'), 'out')!),
      () => expect(kids(doc, 'n1')).toEqual(['n2', 'n6', 'n7', 'n9', 'n10']),
    );
    expect(moveCommand(doc, nodes('n6'), 'out')).toBeNull();
    expect(moveCommand(doc, nodes('n10'), 'down')).toBeNull();
    expect(moveCommand(doc, nodes('n10'), 'into')).toBeNull(); // path is no container
    const layer = (group: number, l: number) => ({
      nodes: [],
      items: [{ kind: 'layer' as const, group, layer: l }],
    });
    roundTrip(
      doc,
      (s) => s.execute(moveCommand(doc, layer(1, 0), 'into')!),
      () => expect(layerNames(doc)).toEqual([['A', 'A2', 'B'], ['P']]),
    );
    expect(moveCommand(doc, layer(0, 0), 'into')).toBeNull();
    roundTrip(
      doc,
      (s) =>
        s.execute(moveCommand(doc, { nodes: [], items: [{ kind: 'group', group: 1 }] }, 'up')!),
      () => expect(groups(doc.iconJson)[1]['name']).toBe('Front'),
    );
  });

  it('Group <g> and Ungroup select the result', () => {
    const doc = treeDocument();
    const store = new DocumentStore(doc);
    const g = groupCommand(doc, nodes('n9', 'n10'))!;
    store.execute(g.command);
    const sel = g.selection();
    expect(kids(doc, sel.nodes[0].id)).toEqual(['n9', 'n10']);
    const u = ungroupCommand(doc, sel)!;
    store.execute(u.command);
    expect(u.selection().nodes.map((r) => r.id)).toEqual(['n9', 'n10']);
    // definitions and nodes of two assets cannot be grouped
    expect(groupCommand(doc, nodes('n3'))).toBeNull();
    expect(
      groupCommand(doc, { nodes: [a('n9'), { asset: 'b.svg', id: 'n12' }], items: [] }),
    ).toBeNull();
    expect(ungroupCommand(doc, nodes('n9'))).toBeNull();
  });
});

describe('visibility (design 006 E4)', () => {
  it('hides and shows nodes, recursively with Alt', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => s.execute(visibilityCommand(doc, nodes('n6'), true)!),
      () => {
        expect(['n6', 'n7', 'n8'].map((id) => doc.node(a(id))!.getAttribute('display'))).toEqual([
          'none',
          'none',
          'none',
        ]);
      },
    );
    const el = doc.node(a('n9'))!;
    el.setAttribute('style', 'display: none; opacity: 0.5');
    const store = new DocumentStore(doc);
    store.execute(visibilityCommand(doc, nodes('n9'))!);
    expect(el.getAttribute('style')).toBe('opacity: 0.5;');
    expect(store.undoLabel()).toBe('Undo Toggle Visibility');
  });

  it('hides groups and layers through icon.json `hidden`', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) =>
        s.execute(
          visibilityCommand(doc, { nodes: [], items: [{ kind: 'group', group: 1 }] }, true)!,
        ),
      () => {
        const g = groups(doc.iconJson)[1];
        expect([g['hidden'], ...layers(g).map((l) => l['hidden'])]).toEqual([true, true, true]);
      },
    );
    const store = new DocumentStore(doc);
    store.execute(
      visibilityCommand(doc, { nodes: [], items: [{ kind: 'layer', group: 0, layer: 0 }] })!,
    );
    store.execute(
      visibilityCommand(doc, { nodes: [], items: [{ kind: 'layer', group: 0, layer: 0 }] })!,
    );
    expect('hidden' in layers(groups(doc.iconJson)[0])[0]).toBe(false);
  });
});

describe('paste (design 006 E12)', () => {
  it('parses whole SVGs and fragments; anything else is refused', () => {
    expect(
      parseClipboard('<svg xmlns="http://www.w3.org/2000/svg"><rect/><circle/></svg>')!.elements,
    ).toHaveLength(2);
    expect(
      parseClipboard('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')!.whole,
    ).not.toBeNull();
    expect(parseClipboard('<rect/>\n<circle r="1"/>')!.elements.map((e) => e.localName)).toEqual([
      'rect',
      'circle',
    ]);
    expect(parseClipboard('hello')).toBeNull();
    expect(parseClipboard('<rect>')).toBeNull();
    expect(parseClipboard('')).toBeNull();
  });

  it('pastes into a container, after a node, into a layer – cleaned, ids unique', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => {
        const p = pasteCommand(
          doc,
          '<rect id="grp" onclick="x()" fill="url(#grp)"/>',
          nodes('n6'),
        )!;
        s.execute(p.command);
        const [ref] = p.selection().nodes;
        const el = doc.node(ref)!;
        expect(el.parentElement!.getAttribute('data-ai-id')).toBe('n6');
        expect(el.getAttribute('id')).toBe('grp-2');
        expect(el.getAttribute('fill')).toBe('url(#grp-2)');
        expect(el.hasAttribute('onclick')).toBe(false);
        expect(s.undoLabel()).toBe('Undo Paste');
      },
      () => undefined,
    );
    roundTrip(
      doc,
      (s) => s.execute(pasteCommand(doc, '<circle/>', nodes('n9'))!.command),
      () => expect(kids(doc, 'n1')).toHaveLength(5),
    );
    roundTrip(
      doc,
      (s) =>
        s.execute(
          pasteCommand(doc, '<svg xmlns="http://www.w3.org/2000/svg"><ellipse/></svg>', {
            nodes: [],
            items: [{ kind: 'layer', group: 1, layer: 0 }],
          })!.command,
        ),
      () => expect(doc.assets.get('b.svg')!.svg!.root.lastElementChild!.localName).toBe('ellipse'),
    );
  });

  it('without a target a whole SVG (or fragments) becomes a new group on top', () => {
    const doc = treeDocument();
    roundTrip(
      doc,
      (s) => {
        const p = pasteCommand(doc, '<path d="M0 0"/>', { nodes: [], items: [{ kind: 'root' }] })!;
        s.execute(p.command);
        expect(layerNames(doc)[0]).toEqual(['Pasted']);
        expect(serializeAsset(doc.assets.get('Pasted.svg')!.svg!)).toContain('<path d="M0 0"');
        expect(p.selection().items).toEqual([{ kind: 'group', group: 0 }]);
      },
      () => undefined,
    );
  });
});

describe('edit.select arguments', () => {
  it('accepts node refs or items, refuses anything else', () => {
    expect(parseSelection({ nodes: [{ asset: 'a.svg', id: 'n3' }] })).toEqual(nodes('n3'));
    expect(parseSelection({ items: [{ kind: 'layer', group: 0, layer: 1 }] })!.items).toHaveLength(
      1,
    );
    expect(parseSelection({})).toEqual({ nodes: [], items: [] });
    for (const bad of [
      { nodes: 'x' },
      { nodes: [{ asset: 'a', id: 'x' }] },
      { nodes: [{ asset: 'a', id: 'n1', extra: 1 }] },
      { items: [{ kind: 'group', group: -1 }] },
      { items: [{ kind: 'layer', group: 0 }] },
      { nodes: [{ asset: 'a', id: 'n1' }], items: [{ kind: 'root' }] },
    ]) {
      expect(parseSelection(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
