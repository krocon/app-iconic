import { IconDocument } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { nodeIndex } from './magic-points';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
  '<g id="g"><rect id="a" width="9"/><circle id="b" r="3"/></g><rect id="c" width="4"/></svg>';

function doc(): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 'a.svg', name: 'a' }] }] } as never,
    assets: [{ name: 'a.svg', kind: 'svg', text: svg }],
    warnings: [],
  });
}

describe('nodeIndex (prompt 033 E4: snap candidates without a lookup per element)', () => {
  it('knows the nodes of the document and which of them move – for the live nodes and copies', () => {
    const d = doc();
    const root = d.assets.get('a.svg')!.svg!.root;
    const el = (id: string) => root.querySelector(`#${id}`)!;
    const ref = (id: string) => ({ asset: 'a.svg', id: el(id).getAttribute(ID_ATTR)! });
    const index = nodeIndex(d, [ref('g')]);
    // the dragged group and everything in it move; the rest counts
    expect(index.moving('a.svg', el('a'))).toBe(true);
    expect(index.counts('a.svg', el('a'))).toBe(false);
    expect(index.counts('a.svg', el('c'))).toBe(true);
    expect(index.moving('a.svg', el('c'))).toBe(false);
    // a painted copy of the asset (LayerStack) answers the same by id
    const copy = root.cloneNode(true) as Element;
    expect(index.moving('a.svg', copy.querySelector('#b')!)).toBe(true);
    expect(index.counts('a.svg', copy.querySelector('#c')!)).toBe(true);
    // no id, another asset, an id the document does not have: neither
    const stray = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    expect(index.counts('a.svg', stray)).toBe(false);
    expect(index.counts('b.svg', el('c'))).toBe(false);
    stray.setAttribute(ID_ATTR, 'n999');
    expect(index.counts('a.svg', stray)).toBe(false);
    expect(index.moving('a.svg', stray)).toBe(false);
  });
});
