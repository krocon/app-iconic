import { camscannerDocument, smallDocument } from '../../../../testing/documents';
import { IconDocument } from '../icon-document';
import { newGroup, newLayer } from '../model/icon-json';
import { parseSvg, serializeAsset } from '../svg/node-ids';
import {
  AddAsset,
  AddGroup,
  AddLayer,
  CommandError,
  CompositeCommand,
  DocCommand,
  InsertNode,
  MoveGroup,
  MoveNode,
  RemoveAsset,
  RemoveAttribute,
  RemoveGroup,
  RemoveLayer,
  RemoveNode,
  ReplaceAssetMarkup,
  SetAttribute,
  SetIconJsonValue,
} from './index';

const a = (id: string) => ({ asset: 'a.svg', id });

function freshSvg(
  doc: IconDocument,
  text = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
) {
  const svg = parseSvg(text)!;
  doc.prepare(svg.doc.documentElement);
  return svg;
}

/** Every command: do changes the document, undo restores it exactly, redo repeats do. */
const CASES: [string, (doc: IconDocument) => DocCommand][] = [
  ['SetAttribute (new)', () => new SetAttribute(a('n3'), 'stroke', 'blue')],
  ['SetAttribute (existing)', () => new SetAttribute(a('n3'), 'fill', 'blue', 'changeFill')],
  ['SetAttribute (xlink)', () => new SetAttribute(a('n4'), 'xlink:href', '#x')],
  ['RemoveAttribute', () => new RemoveAttribute(a('n3'), 'fill')],
  ['InsertNode', () => new InsertNode(a('n2'), '<ellipse rx="1" onclick="x()"/>', 0)],
  ['InsertNode (end)', () => new InsertNode(a('n1'), '<rect/>')],
  ['RemoveNode', () => new RemoveNode(a('n3'))],
  ['MoveNode', () => new MoveNode(a('n4'), a('n1'), 0)],
  [
    'MoveNode (to another asset)',
    (d) => new MoveNode(a('n4'), { asset: 'b.svg', id: firstId(d, 'b.svg') }, 0),
  ],
  [
    'ReplaceAssetMarkup',
    () =>
      new ReplaceAssetMarkup('a.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>'),
  ],
  ['SetIconJsonValue', () => new SetIconJsonValue(['groups', 0, 'shadow', 'opacity'], 0.2)],
  ['SetIconJsonValue (remove)', () => new SetIconJsonValue(['fill'], undefined)],
  ['AddGroup', () => new AddGroup(newGroup(newLayer('a.svg', 'x')), 0)],
  ['RemoveGroup', () => new RemoveGroup(0)],
  ['MoveGroup', () => new MoveGroup(1, 0)],
  ['AddLayer', () => new AddLayer(0, newLayer('a.svg', 'y'))],
  ['RemoveLayer', () => new RemoveLayer(0, 0)],
  ['AddAsset', (d) => new AddAsset('c.svg', freshSvg(d))],
  ['RemoveAsset', () => new RemoveAsset('a.svg')],
  [
    'CompositeCommand',
    (d) =>
      new CompositeCommand('importSvg', [
        new AddAsset('c.svg', freshSvg(d)),
        new AddGroup(newGroup(newLayer('c.svg', 'c'))),
      ]),
  ],
];

function firstId(doc: IconDocument, asset: string): string {
  return doc.assets.get(asset)!.svg!.doc.documentElement.getAttribute('data-ai-id')!;
}

function document(): IconDocument {
  const doc = smallDocument();
  doc.iconJson = {
    ...doc.iconJson,
    groups: [...doc.iconJson.groups!, newGroup(newLayer('b.svg', 'b'))],
  };
  doc.insertAsset({ name: 'b.svg', kind: 'svg', svg: freshSvg(doc) });
  return doc;
}

describe('document commands', () => {
  it.each(CASES)('%s: do → undo → identical, redo → same as do', (_name, make) => {
    const doc = document();
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
      new AddAsset('A.SVG'.toLowerCase(), freshSvg(doc)),
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
