import { describe, expect, it } from 'vitest';
import { smallDocument } from '../../../../testing/documents';
import { ID_ATTR, serializeAsset } from '../svg/node-ids';
import { CommandError } from './command';
import { commandFromJson } from './registry';
import { ReplaceNode } from './replace-node';

const rect = (doc: ReturnType<typeof smallDocument>) =>
  doc.assets.get('a.svg')!.svg!.root.querySelector('rect')!;

describe('ReplaceNode (design 011 E5)', () => {
  it('puts the cleaned element at the same place with fresh ids; undo / redo', () => {
    const doc = smallDocument();
    const old = rect(doc);
    const ref = { asset: 'a.svg', id: old.getAttribute(ID_ATTR)! };
    const before = serializeAsset(doc.assets.get('a.svg')!.svg!, true);
    const cmd = new ReplaceNode(ref, '<g onclick="x()"><rect width="3" fill="blue"/></g>');
    cmd.do(doc);
    const g = doc.node(cmd.newRef!)!;
    expect(g.localName).toBe('g');
    expect(g.hasAttribute('onclick')).toBe(false);
    expect(g.nextElementSibling?.localName).toBe('circle');
    expect(g.firstElementChild!.getAttribute(ID_ATTR)).toMatch(/^n\d+$/);
    expect(doc.node(ref)).toBeNull();
    cmd.undo();
    expect(serializeAsset(doc.assets.get('a.svg')!.svg!, true)).toBe(before);
    expect(doc.node(ref)).toBe(old);
    cmd.do(doc);
    expect(doc.node(cmd.newRef!)).toBe(g);
  });

  it('refuses the asset root, invalid markup and more than one element', () => {
    const doc = smallDocument();
    const root = doc.assets.get('a.svg')!.svg!.root;
    const rootRef = { asset: 'a.svg', id: root.getAttribute(ID_ATTR)! };
    const ref = { asset: 'a.svg', id: rect(doc).getAttribute(ID_ATTR)! };
    expect(() => new ReplaceNode(rootRef, '<g/>').do(doc)).toThrow(CommandError);
    expect(() => new ReplaceNode(ref, '<g>').do(doc)).toThrow(CommandError);
    expect(() => new ReplaceNode(ref, '<g/><g/>').do(doc)).toThrow(CommandError);
    expect(rect(doc)).toBeTruthy();
  });

  it('comes back from JSON', () => {
    const json = { type: 'replaceNode', ref: { asset: 'a.svg', id: 'n3' }, markup: '<g/>' };
    expect(commandFromJson(json).toJSON()).toEqual(json);
    expect(() => commandFromJson({ ...json, extra: 1 })).toThrow(CommandError);
  });
});
