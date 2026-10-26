import { IconDocument } from '../document/icon-document';
import { SetAttribute, SetIconJsonValue } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { camscannerDocument } from '../../../testing/documents';
import { LayerStack, stackOf } from './layer-stack';

const A3 = 'logo-scanner 3.svg';
const A2 = 'logo-scanner-2 2.svg';
const square =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="9"/></svg>';

function doc(groups: unknown[], assets = ['a.svg', 'b.svg', 'c.svg']): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: groups as never },
    assets: [
      ...assets.map((name) => ({ name, kind: 'svg' as const, text: square })),
      { name: 'p.png', kind: 'png' as const, dataUrl: 'data:image/png;base64,AAAA' },
    ],
    warnings: [],
  });
}

const L = (name: string, extra: object = {}) => ({ 'image-name': name, name, ...extra });

describe('stackOf', () => {
  it('paints the first group and layer on top (bottom first in the result)', () => {
    const d = doc([{ layers: [L('a.svg'), L('b.svg')] }, { layers: [L('c.svg')] }]);
    const order = stackOf(d, 'light').flatMap((g) => g.layers.map((l) => l.asset.name));
    expect(order).toEqual(['c.svg', 'b.svg', 'a.svg']);
  });

  it('skips hidden groups/layers and missing assets, keeps opacities', () => {
    const d = doc([
      {
        layers: [L('a.svg', { opacity: 0.4 }), L('nope.svg'), L('b.svg', { hidden: true })],
        opacity: 0.5,
      },
      { layers: [L('c.svg')], hidden: true },
    ]);
    const stack = stackOf(d, 'light');
    expect(stack).toHaveLength(1);
    expect(stack[0].opacity).toBe(0.5);
    expect(stack[0].layers.map((l) => [l.asset.name, l.opacity])).toEqual([['a.svg', 0.4]]);
  });

  it('gives the live root to the topmost use of an asset', () => {
    const d = doc([{ layers: [L('a.svg')] }, { layers: [L('a.svg')] }]);
    const flat = stackOf(d, 'light').flatMap((g) => g.layers);
    expect(flat.map((l) => [l.group, l.live])).toEqual([
      [1, false],
      [0, true],
    ]);
  });

  it('follows image-name-specializations', () => {
    const d = doc([
      {
        layers: [
          {
            name: 'x',
            'image-name-specializations': [
              { value: 'a.svg' },
              { appearance: 'dark', value: 'b.svg' },
            ],
          },
        ],
      },
    ]);
    expect(stackOf(d, 'light')[0].layers[0].asset.name).toBe('a.svg');
    expect(stackOf(d, 'dark')[0].layers[0].asset.name).toBe('b.svg');
  });
});

describe('LayerStack', () => {
  let box: HTMLElement;
  beforeEach(() => {
    box = document.createElement('div');
    document.body.append(box);
  });
  afterEach(() => box.remove());

  it('hangs the live asset roots into shadow roots, camscanner first group on top', () => {
    const d = camscannerDocument();
    new LayerStack(box).update(d, 'light');
    const layers = [...box.querySelectorAll<HTMLElement>('.layer')];
    expect(layers.map((l) => l.dataset['asset'])).toEqual([A2, A3]);
    const host = layers[1].shadowRoot!.querySelector('svg.layer-host')!;
    expect(host.getAttribute('viewBox')).toBe('0 0 1024 1024');
    expect(host.querySelector('svg.placement > svg')).toBe(d.assets.get(A3)!.svg!.root);
  });

  it('does not rebuild on attribute changes, but on structure changes', () => {
    const d = camscannerDocument();
    const store = new DocumentStore(d);
    const stack = new LayerStack(box);
    stack.update(d, 'light');
    const first = box.querySelector('.layer');
    const root = d.assets.get(A3)!.svg!.root;
    store.execute(
      new SetAttribute({ asset: A3, id: root.getAttribute('data-ai-id')! }, 'opacity', '0.3'),
    );
    stack.update(d, 'light');
    expect(box.querySelector('.layer')).toBe(first);
    store.execute(new SetIconJsonValue(['groups', 0, 'layers', 0, 'opacity'], 0.25));
    stack.update(d, 'light');
    expect(box.querySelector('.layer')).not.toBe(first);
    const g = box
      .querySelector<HTMLElement>(`.layer[data-asset="${A3}"]`)!
      .shadowRoot!.querySelector('g')!;
    expect(g.getAttribute('opacity')).toBe('0.25');
    expect(g.querySelector('svg.placement > svg')).toBe(root);
    stack.update(null, 'light');
    expect(box.children).toHaveLength(0);
  });

  it('refreshes copies of an asset used twice', () => {
    const d = doc([{ layers: [L('a.svg')] }, { layers: [L('a.svg')] }]);
    const stack = new LayerStack(box);
    stack.update(d, 'light');
    const root = d.assets.get('a.svg')!.svg!.root;
    root.querySelector('rect')!.setAttribute('width', '77');
    stack.update(d, 'light');
    const bottom = box.querySelector<HTMLElement>('.layer[data-group="1"]')!;
    const copy = bottom.shadowRoot!.querySelector('svg.placement > svg')!;
    expect(copy).not.toBe(root);
    expect(copy.querySelector('rect')!.getAttribute('width')).toBe('77');
  });

  it('shows PNG assets as <image>', () => {
    const d = doc([{ layers: [L('p.png')] }]);
    new LayerStack(box).update(d, 'light');
    const img = box.querySelector('.layer')!.shadowRoot!.querySelector('image')!;
    expect(img.getAttribute('href')).toBe('data:image/png;base64,AAAA');
  });
});
