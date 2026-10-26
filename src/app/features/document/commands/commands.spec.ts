import { camscannerDocument, smallDocument } from '../../../../testing/documents';
import { a, CASES, commandDocument, firstId, SVG } from '../../../../testing/command-cases';
import { newLayer } from '../model/icon-json';
import { serializeAsset } from '../svg/node-ids';
import {
  AddAsset,
  CommandError,
  CompositeCommand,
  DocCommand,
  InsertNode,
  MoveGroup,
  MoveNode,
  RemoveAsset,
  RemoveGroup,
  RemoveLayer,
  RemoveNode,
  ReplaceAssetMarkup,
  SetAttribute,
  SetIconJsonValue,
  AddLayer,
} from './index';

describe('document commands', () => {
  it.each(CASES)('%s: do → undo → identical, redo → same as do', (_name, make) => {
    const doc = commandDocument();
    const before = doc.snapshot();
    const cmd = make(doc);
    cmd.do(doc);
    const after = doc.snapshot();
    expect(after).not.toBe(before);
    cmd.undo(doc);
    expect(doc.snapshot()).toBe(before);
    cmd.do(doc);
    expect(doc.snapshot()).toBe(after);
    cmd.undo(doc);
    expect(doc.snapshot()).toBe(before);
  });

  it('keeps the key order and unknown fields of icon.json through undo', () => {
    const doc = smallDocument();
    const cmd = new SetIconJsonValue(['fill'], undefined);
    cmd.do(doc);
    cmd.undo(doc);
    expect(Object.keys(doc.iconJson)).toEqual(['fill', 'groups', 'x-top']);
    expect(doc.iconJson.groups![0]['x-future']).toBe(true);
  });

  it('inserted markup is cleaned and gets ids; redo keeps them', () => {
    const doc = smallDocument();
    const cmd = new InsertNode(a('n2'), '<ellipse onclick="x()"><title>t</title></ellipse>');
    cmd.do(doc);
    const ref = cmd.ref!;
    expect(doc.node(ref)!.hasAttribute('onclick')).toBe(false);
    expect(doc.node(ref)!.firstElementChild!.getAttribute('data-ai-id')).toMatch(/^n\d+$/);
    cmd.undo();
    expect(doc.node(ref)).toBeNull();
    cmd.do(doc);
    expect(doc.node(ref)!.localName).toBe('ellipse');
  });

  it('fails without changing anything on a missing target or bad input', () => {
    const doc = smallDocument();
    const before = doc.snapshot();
    const bad: DocCommand[] = [
      new SetAttribute(a('n99'), 'fill', 'x'),
      new RemoveNode(a('n1')),
      new MoveNode(a('n2'), a('n3'), 0),
      new InsertNode(a('n2'), '<rect'),
      new InsertNode(a('n2'), '<rect/>', 9),
      new ReplaceAssetMarkup('a.svg', 'nope'),
      new ReplaceAssetMarkup('p.png', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
      new RemoveGroup(5),
      new MoveGroup(0, 3),
      new AddLayer(4, newLayer('a.svg', 'x')),
      new RemoveLayer(0, 3),
      new RemoveAsset('nope.svg'),
      new AddAsset('A.SVG'.toLowerCase(), SVG),
      new AddAsset('c.svg', 'no svg'),
      new CompositeCommand('importSvg', [new SetIconJsonValue(['fill'], 'x'), new RemoveGroup(9)]),
    ];
    for (const c of bad) expect(() => c.do(doc), c.constructor.name).toThrow(CommandError);
    expect(doc.snapshot()).toBe(before.replace(/n\d+/g, (m) => m));
    expect(() => new SetAttribute(a('n3'), 'onclick', 'x')).toThrow(CommandError);
    expect(() => new SetAttribute(a('n3'), 'data-ai-id', 'x')).toThrow(CommandError);
    expect(() => new SetIconJsonValue([], 1)).toThrow(CommandError);
  });

  it('serialised assets of the fixture stay byte-equal after do + undo of every node command', () => {
    const doc = camscannerDocument();
    const name = 'logo-scanner 3.svg';
    const original = serializeAsset(doc.assets.get(name)!.svg!);
    const id = firstId(doc, name);
    const cmds: DocCommand[] = [
      new SetAttribute({ asset: name, id }, 'opacity', '0.5'),
      new InsertNode({ asset: name, id }, '<rect/>'),
    ];
    for (const c of cmds) c.do(doc);
    for (const c of cmds.reverse()) c.undo(doc);
    expect(serializeAsset(doc.assets.get(name)!.svg!)).toBe(original);
    expect(doc.saveRequest(doc.path!, 'bundle').assets.every((x) => x.unchanged)).toBe(true);
  });
});
