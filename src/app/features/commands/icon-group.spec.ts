import { treeDocument } from '../../../testing/tree-documents';
import { commandFromJson } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { serializeAsset } from '../document/svg/node-ids';
import { iconGroupPlan } from './icon-group';

const NONE = { nodes: [], items: [] };

describe('iconGroupPlan (design 008 E4)', () => {
  it('adds group + layer + 1024 asset behind the current group, as one undo step', () => {
    const doc = treeDocument();
    const store = new DocumentStore(doc);
    const before = doc.snapshot();
    const plan = iconGroupPlan(doc, { nodes: [{ asset: 'b.svg', id: 'n12' }], items: [] });
    expect(plan).toMatchObject({ group: 2, asset: 'layer-3.svg', layer: 'layer-3' });
    store.execute(plan.command);
    const g = groups(doc.iconJson)[2];
    expect(layers(g)).toEqual([{ 'image-name': 'layer-3.svg', name: 'layer-3' }]);
    expect(g.shadow).toEqual({ kind: 'neutral', opacity: 0.5 });
    const svg = doc.assets.get('layer-3.svg')!.svg!;
    expect(svg.root.getAttribute('viewBox')).toBe('0 0 1024 1024');
    expect(serializeAsset(svg)).not.toContain('data-ai');
    expect(store.undoLabel()).toBe('Undo Add Group');
    store.undo();
    expect(doc.snapshot()).toBe(before);
  });

  it('goes behind the first group without a selection, at 0 without groups', () => {
    expect(iconGroupPlan(treeDocument(), NONE).group).toBe(1);
    expect(iconGroupPlan(new IconDocument(), NONE)).toMatchObject({
      group: 0,
      asset: 'layer-1.svg',
    });
  });

  it('makes names unique (unique_* rules) and survives JSON', () => {
    const doc = treeDocument();
    doc.insertAsset({ name: 'Layer-3.svg', kind: 'other' });
    doc.iconJson = {
      ...doc.iconJson,
      groups: [...groups(doc.iconJson), { layers: [{ 'image-name': 'x', name: 'layer-3 2' }] }],
    };
    const plan = iconGroupPlan(doc, NONE);
    expect(plan.asset).toBe('layer-4.svg');
    const doc2 = treeDocument();
    doc2.insertAsset({ name: 'layer-3.svg', kind: 'other' });
    const p2 = iconGroupPlan(doc2, NONE);
    expect(p2).toMatchObject({ asset: 'layer-3 2.svg', layer: 'layer-3 2' });
    const json = JSON.parse(JSON.stringify(p2.command.toJSON()));
    const again = commandFromJson(json);
    const s = new DocumentStore(doc2);
    s.execute(again);
    expect(doc2.assets.has('layer-3 2.svg')).toBe(true);
  });

  it('puts content into the new asset', () => {
    const doc = new IconDocument();
    const plan = iconGroupPlan(doc, NONE, 'addCircle', '<circle r="1"/>\n');
    new DocumentStore(doc).execute(plan.command);
    expect(doc.assets.get('layer-1.svg')!.svg!.root.children[0].localName).toBe('circle');
  });
});
