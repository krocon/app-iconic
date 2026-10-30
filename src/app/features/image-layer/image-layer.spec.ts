import { smallDocument } from '../../../testing/documents';
import { DocumentStore } from '../document/document.store';
import { exportSvg } from '../export/export-svg';
import { newGroup, newLayer } from '../document/model/icon-json';
import {
  assetBase,
  imageLayerPlan,
  LayerImage,
  rasterAssetOf,
  replaceImageCommand,
} from './image-layer';

const PNG = 'data:image/png;base64,iVBORw0KGgoNEW=';
const png = (name = 'Ball.png', width = 512, height = 512): LayerImage => ({
  kind: 'png',
  name,
  dataUrl: PNG,
  width,
  height,
});
const none = { nodes: [], items: [] };

describe('Import Image as Layer (prompt 080 E1–E3)', () => {
  it('asset names: the stem with the kind, unique like names.rs', () => {
    expect(assetBase('photo.jpeg', 'png')).toBe('photo.png');
    expect(assetBase('1 – Layer.png', 'png')).toBe('1 – Layer.png');
    expect(assetBase('  ', 'png')).toBe('image.png');
    const doc = smallDocument();
    const plan = imageLayerPlan(doc, png('p.png'), none);
    expect(plan.assetName).toBe('p 2.png');
    expect(plan.layerName).toBe('p 2');
  });

  it('a new layer in front of the active group, one undo step', () => {
    const doc = smallDocument();
    doc.iconJson = {
      ...doc.iconJson,
      groups: [...doc.iconJson.groups!, newGroup(newLayer('a.svg', 'second'))],
    };
    const store = new DocumentStore(doc);
    const before = doc.snapshot();
    const plan = imageLayerPlan(doc, png(), { nodes: [], items: [{ kind: 'group', group: 1 }] });
    store.execute(plan.command);
    expect(plan.item).toEqual({ kind: 'layer', group: 1, layer: 0 });
    expect(doc.iconJson.groups![1].layers![0]).toEqual({ 'image-name': 'Ball.png', name: 'Ball' });
    expect(doc.asset('Ball.png')).toMatchObject({ kind: 'png', dataUrl: PNG });
    expect(store.undoLabel()).toContain('Import Image as Layer');
    store.undo();
    expect(doc.snapshot()).toBe(before);
  });

  it('directly in front of a selected layer; the group of a selected node', () => {
    const doc = smallDocument();
    doc.iconJson = {
      ...doc.iconJson,
      groups: [{ layers: [newLayer('a.svg', 'a'), newLayer('p.png', 'p')] }],
    };
    const sel = { nodes: [], items: [{ kind: 'layer' as const, group: 0, layer: 1 }] };
    expect(imageLayerPlan(doc, png(), sel).item).toEqual({ kind: 'layer', group: 0, layer: 1 });
    const node = { nodes: [{ asset: 'a.svg', id: 'n2' }], items: [] };
    expect(imageLayerPlan(doc, png(), node).item).toEqual({ kind: 'layer', group: 0, layer: 0 });
  });

  it('no groups: a new group on top', () => {
    const doc = smallDocument();
    doc.iconJson = { fill: 'automatic', groups: [] };
    const plan = imageLayerPlan(doc, png(), none);
    plan.command.do(doc);
    expect(doc.iconJson.groups).toHaveLength(1);
    expect(doc.iconJson.groups![0].layers![0]['image-name']).toBe('Ball.png');
  });

  it('an image larger than the canvas fits it with a position (E3)', () => {
    const doc = smallDocument();
    const plan = imageLayerPlan(doc, png('big.png', 4096, 2048), none);
    plan.command.do(doc);
    expect(doc.iconJson.groups![0].layers![0]).toEqual({
      'image-name': 'big.png',
      name: 'big',
      position: { scale: 0.25, 'translation-in-points': [0, 0] },
    });
  });

  it('an SVG becomes an SVG layer', () => {
    const doc = smallDocument();
    const image: LayerImage = {
      kind: 'svg',
      name: 'logo.svg',
      markup: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>',
    };
    imageLayerPlan(doc, image, none).command.do(doc);
    expect(doc.asset('logo.svg')?.svg?.root.querySelector('rect')).toBeTruthy();
  });
});

describe('Replace Layer Image (prompt 080 E4)', () => {
  it('new bytes under the same name; layer fields stay; undo puts the old ones back', () => {
    const doc = smallDocument();
    const pos = { scale: 0.5, 'translation-in-points': [3, 4] };
    doc.iconJson = { groups: [{ layers: [{ ...newLayer('p.png', 'p'), position: pos }] }] };
    const store = new DocumentStore(doc);
    const item = { kind: 'layer' as const, group: 0, layer: 0 };
    expect(rasterAssetOf(doc, item)).toBe('p.png');
    const old = doc.asset('p.png')!.dataUrl;
    store.execute(replaceImageCommand(doc, item, png())!);
    expect(doc.asset('p.png')!.dataUrl).toBe(PNG);
    expect(doc.iconJson.groups![0].layers![0]['position']).toEqual(pos);
    expect([...doc.assets.keys()]).toEqual(['a.svg', 'p.png']);
    store.undo();
    expect(doc.asset('p.png')!.dataUrl).toBe(old);
  });

  it('only PNG layers, only PNG images', () => {
    const doc = smallDocument();
    const svgLayer = { kind: 'layer' as const, group: 0, layer: 0 };
    expect(rasterAssetOf(doc, svgLayer)).toBeNull();
    expect(replaceImageCommand(doc, svgLayer, png())).toBeNull();
    expect(rasterAssetOf(doc, { kind: 'group', group: 0 })).toBeNull();
  });
});

describe('PNG layers in the preview and every export (prompt 080)', () => {
  // design 080: the export SVG is the source of SVG/PNG files, the packages (078/079), the small
  // preview and "Copy as PNG" – all through exportSvg
  const imported = () => {
    const doc = smallDocument();
    doc.iconJson = { fill: 'automatic', groups: [] };
    imageLayerPlan(doc, png('Ball.png', 200, 100), { nodes: [], items: [] }).command.do(doc);
    const l = doc.iconJson.groups![0].layers![0];
    l['position'] = { scale: 0.5, 'translation-in-points': [100, -50] };
    l['fill-specializations'] = [{ appearance: 'tinted', value: { solid: 'srgb:1,0,0,1' } }];
    return doc;
  };
  const sizes = new Map([['Ball.png', { width: 200, height: 100 }]]);

  it('the image at its natural size, inside the layer position', () => {
    const svg = exportSvg(imported(), 'light', { mask: 'none', effects: false }, sizes);
    expect(svg).toContain(`href="${PNG}"`);
    expect(svg).toMatch(/<image x="412" y="462" width="200" height="100"/);
    expect(svg).toContain('transform="translate(612 462) scale(0.5) translate(-512 -512)"');
  });

  it('tinted: the layer fill masks the image, the tint filter wraps it', () => {
    const svg = exportSvg(imported(), 'tinted', { mask: 'none', effects: false }, sizes);
    expect(svg).toMatch(/<mask[^>]*mask-type="alpha"[^>]*>.*<image/s);
    expect(svg).toContain('filter="url(#');
  });

  it('Android foreground (079: one group, scaled) keeps the image', () => {
    const svg = exportSvg(
      imported(),
      'light',
      { mask: 'none', effects: false, groups: [0], fill: false, scale: 0.5 },
      sizes,
    );
    expect(svg).toContain(`href="${PNG}"`);
  });
});
