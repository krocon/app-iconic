import { IconJson } from '../../core/icon-file/icon-file.models';
import { DocumentStore } from '../document/document.store';
import { smallDocument } from '../../../testing/documents';
import { layerPlacement, positionCommand, toAssetSpace } from './layer-frame';
import { frameCorners } from './layer-position';

const json = (layer: object, group: object = {}): IconJson => ({
  groups: [{ ...group, layers: [{ 'image-name': 'p.png', name: 'p', ...layer }] }],
});
const item = { kind: 'layer', group: 0, layer: 0 } as const;

describe('layer frame (prompt 080 E8)', () => {
  it('group outside, layer inside – like stackTransform', () => {
    const j = json(
      { position: { scale: 0.5, 'translation-in-points': [100, 0] } },
      { position: { scale: 2, 'translation-in-points': [0, 0] } },
    );
    const p = layerPlacement(j, item, 'light')!;
    // asset centre → layer: 612,512 → group: 2·(612−512)+512 = 712
    expect(frameCorners(p.matrix, { x: 512, y: 512, width: 0, height: 0 })[0]).toEqual({
      x: 712,
      y: 512,
    });
    expect(layerPlacement(j, { kind: 'layer', group: 0, layer: 3 }, 'light')).toBeNull();
  });

  it('uses the position of the appearance', () => {
    const j = json({
      'position-specializations': [
        { value: { scale: 1, 'translation-in-points': [0, 0] } },
        { appearance: 'dark', value: { scale: 0.5, 'translation-in-points': [10, 0] } },
      ],
    });
    expect(layerPlacement(j, item, 'light')!.layer.scale).toBe(1);
    expect(layerPlacement(j, item, 'dark')!.layer).toEqual({ scale: 0.5, tx: 10, ty: 0 });
  });

  it('maps a document rectangle back into asset space', () => {
    const p = layerPlacement(
      json({ position: { scale: 2, 'translation-in-points': [0, 0] } }),
      item,
      'light',
    )!;
    expect(toAssetSpace(p.matrix, { x: 0, y: 0, width: 1024, height: 1024 })).toEqual({
      x: 256,
      y: 256,
      width: 512,
      height: 512,
    });
  });

  it('writes position for light as the base value, for dark as its entry – one undo step', () => {
    const doc = smallDocument();
    doc.iconJson = json({});
    const store = new DocumentStore(doc);
    const pos = { scale: 0.5, tx: 12, ty: -3 };
    store.execute(positionCommand(doc.iconJson, item, 'light', pos, 'moveLayerOnCanvas')!);
    expect(doc.iconJson.groups![0].layers![0]['position']).toEqual({
      scale: 0.5,
      'translation-in-points': [12, -3],
    });
    store.execute(positionCommand(doc.iconJson, item, 'dark', { ...pos, tx: 0 }, 'scaleLayer')!);
    const l = doc.iconJson.groups![0].layers![0];
    expect(l['position']).toBeUndefined();
    expect(l['position-specializations']).toEqual([
      { value: { scale: 0.5, 'translation-in-points': [12, -3] } },
      { appearance: 'dark', value: { scale: 0.5, 'translation-in-points': [0, -3] } },
    ]);
    store.undo();
    store.undo();
    expect(doc.iconJson.groups![0].layers![0]['position']).toBeUndefined();
  });
});
