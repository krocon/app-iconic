import { describe, expect, it } from 'vitest';
import { allFieldsDocument, camscannerDocument, smallDocument } from '../../../testing/documents';
import { DocumentStore } from '../document/document.store';
import { fieldDef } from './icon-fields';
import {
  assetReferences,
  colorSpaceCommand,
  editsCommand,
  fieldEdits,
  fieldState,
  platformsCommand,
  renameAssetCommand,
  renameGroupCommand,
  renameLayerCommand,
  variantRemoval,
} from './inspector-edit';
import { formatIconJson } from './icon-json-text';

const G0 = { kind: 'group', group: 0 } as const;
const L00 = { kind: 'layer', group: 0, layer: 0 } as const;

function run(store: DocumentStore, cmd: ReturnType<typeof editsCommand>) {
  expect(cmd).not.toBeNull();
  store.execute(cmd!);
}

describe('inspector edits (design 010 E3, E5)', () => {
  it('layer opacity: a slider value as one SetIconJsonValue, undo = original bytes', () => {
    const store = new DocumentStore(camscannerDocument());
    const before = formatIconJson(store.document().iconJson);
    const def = fieldDef('layer', 'opacity')!;
    expect(fieldState(store.document().iconJson, L00, def, 'default').value).toBe(1);
    const edits = fieldEdits(store.document().iconJson, L00, def, 'default', 0.4)!;
    expect(edits).toEqual([{ path: ['groups', 0, 'layers', 0, 'opacity'], value: 0.4 }]);
    run(store, editsCommand(edits, def.undo));
    expect(store.undoLabel()).toBe('Undo Change Layer Opacity');
    // the second layer had no opacity: it is added at its sorted place
    const l1 = { kind: 'layer', group: 1, layer: 0 } as const;
    run(
      store,
      editsCommand(fieldEdits(store.document().iconJson, l1, def, 'default', 0.5)!, def.undo),
    );
    expect(Object.keys(store.document().iconJson.groups![1].layers![0])).toEqual([
      'image-name',
      'name',
      'opacity',
    ]);
    store.undo();
    store.undo();
    expect(formatIconJson(store.document().iconJson)).toBe(before);
  });

  it('rejects values outside the field and wrong targets', () => {
    const json = camscannerDocument().iconJson;
    const def = fieldDef('layer', 'opacity')!;
    expect(fieldEdits(json, L00, def, 'default', 1.5)).toBeNull();
    expect(fieldEdits(json, L00, def, 'default', '0.5')).toBeNull();
    expect(fieldEdits(json, G0, def, 'default', 0.5)).toBeNull();
    expect(fieldEdits(json, { kind: 'layer', group: 0, layer: 9 }, def, 'default', 0.5)).toBeNull();
    const fill = fieldDef('root', 'background')!;
    expect(fieldEdits(json, { kind: 'root' }, fill, 'default', { solid: 'nope' })).toBeNull();
  });

  it('shadow parts: only the sub key, unknown keys stay; dark creates a variant', () => {
    const doc = allFieldsDocument();
    const store = new DocumentStore(doc);
    const kind = fieldDef('group', 'shadow.kind')!;
    expect(fieldState(doc.iconJson, G0, kind, 'default').value).toBe('layer-color');
    run(store, editsCommand(fieldEdits(doc.iconJson, G0, kind, 'default', 'none')!, kind.undo));
    expect(doc.iconJson.groups![0].shadow).toEqual({
      kind: 'none',
      opacity: 0.5,
      'x-future-shadow': true,
    });
    const op = fieldDef('group', 'shadow.opacity')!;
    run(store, editsCommand(fieldEdits(doc.iconJson, G0, op, 'dark', 0.8)!, op.undo));
    const g = doc.iconJson.groups![0];
    expect(g.shadow).toBeUndefined();
    expect(g['shadow-specializations']).toEqual([
      { value: { kind: 'none', opacity: 0.5, 'x-future-shadow': true } },
      { appearance: 'dark', value: { kind: 'none', opacity: 0.8, 'x-future-shadow': true } },
    ]);
    expect(fieldState(doc.iconJson, G0, op, 'dark')).toMatchObject({ value: 0.8, variant: true });
    expect(fieldState(doc.iconJson, G0, op, 'default')).toMatchObject({
      value: 0.5,
      variant: false,
    });
    run(store, editsCommand(variantRemoval(doc.iconJson, G0, op, 'dark'), 'removeVariant'));
    expect(doc.iconJson.groups![0].shadow).toEqual({
      kind: 'none',
      opacity: 0.5,
      'x-future-shadow': true,
    });
  });

  it('position x/y write the translation list; a missing position gets the default', () => {
    const doc = camscannerDocument();
    const x = fieldDef('layer', 'position.x')!;
    const edits = fieldEdits(doc.iconJson, L00, x, 'default', 12)!;
    expect(edits).toEqual([
      {
        path: ['groups', 0, 'layers', 0, 'position'],
        value: { scale: 1, 'translation-in-points': [12, 0] },
      },
    ]);
  });

  it('every field of the all-fields fixture reads without falling back to an error', () => {
    const json = allFieldsDocument().iconJson;
    const blur = fieldDef('group', 'blur-material')!;
    expect(fieldState(json, G0, blur, 'default').value).toBeNull();
    expect(fieldState(json, { kind: 'group', group: 1 }, blur, 'dark').value).toBe(0.08);
    const asset = fieldDef('layer', 'image-name')!;
    const l1 = { kind: 'layer', group: 0, layer: 1 } as const;
    expect(fieldState(json, l1, asset, 'dark')).toMatchObject({
      value: 'shape.svg',
      variant: true,
    });
    const pos = fieldDef('layer', 'position.scale')!;
    expect(fieldState(json, l1, pos, 'default')).toMatchObject({ value: 1, otherVariants: true });
  });
});

describe('names, assets, platforms (design 010 E9, E10)', () => {
  it('layer names are unique, group names optional', () => {
    const doc = camscannerDocument();
    const cmd = renameLayerCommand(doc.iconJson, 0, 0, 'logo-scanner-2 2')!;
    expect(cmd.toJSON()).toMatchObject({ value: 'logo-scanner-2 2 2', label: 'renameLayer' });
    expect(renameLayerCommand(doc.iconJson, 0, 0, 'logo-scanner 3')).toBeNull();
    expect(renameLayerCommand(doc.iconJson, 0, 0, '  ')).toBeNull();
    expect(renameGroupCommand(doc.iconJson, 0, 'Front')!.toJSON()).toMatchObject({
      path: ['groups', 0, 'name'],
      value: 'Front',
    });
    expect(renameGroupCommand(doc.iconJson, 0, '')).toBeNull();
  });

  it('renaming an asset renames the file and every reference in one step', () => {
    const doc = allFieldsDocument();
    const store = new DocumentStore(doc);
    expect(assetReferences(doc.iconJson, 'shape.svg')).toHaveLength(3);
    const before = formatIconJson(doc.iconJson);
    run(store, renameAssetCommand(doc, 'shape.svg', 'Logo'));
    expect([...doc.assets.keys()]).toEqual(['Logo.svg']);
    expect(assetReferences(doc.iconJson, 'Logo.svg')).toHaveLength(3);
    expect(store.undoLabel()).toBe('Undo Rename Asset');
    expect(doc.saveRequest(doc.path!, 'bundle').assets[0]).toEqual({
      name: 'Logo.svg',
      unchanged: true,
      source: 'shape.svg',
    });
    store.undo();
    expect([...doc.assets.keys()]).toEqual(['shape.svg']);
    expect(formatIconJson(doc.iconJson)).toBe(before);
    // unique against the other assets; same name = nothing
    const small = smallDocument();
    expect(renameAssetCommand(small, 'a.svg', 'p.png')!.toJSON()).toMatchObject({
      commands: [{ type: 'renameAsset', from: 'a.svg', to: 'p 2.png' }, expect.anything()],
    });
    expect(renameAssetCommand(small, 'a.svg', 'a.svg')).toBeNull();
    expect(renameAssetCommand(small, 'nope.svg', 'x.svg')).toBeNull();
  });

  it('platforms and colour space', () => {
    const doc = camscannerDocument();
    const store = new DocumentStore(doc);
    run(store, platformsCommand(doc.iconJson, { squares: 'iOS+macOS', watchOS: false }));
    expect(doc.iconJson['supported-platforms']).toEqual({ squares: ['iOS', 'macOS'] });
    expect(store.undoLabel()).toBe('Undo Change Platforms');
    expect(platformsCommand(doc.iconJson, { watchOS: false })).toBeNull();
    run(store, colorSpaceCommand(doc.iconJson, 'srgb'));
    expect(Object.keys(doc.iconJson)[0]).toBe('color-space-for-untagged-svg-colors');
    expect(colorSpaceCommand(doc.iconJson, 'srgb')).toBeNull();
  });
});
