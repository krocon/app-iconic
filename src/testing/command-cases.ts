import { IconDocument } from '../app/features/document/icon-document';
import { newGroup, newLayer } from '../app/features/document/model/icon-json';
import { parseSvg } from '../app/features/document/svg/node-ids';
import {
  AssignClip,
  InsertDefinition,
  RemoveClipPath,
  SetLayerClip,
  AddAsset,
  AddGroup,
  AddLayer,
  CompositeCommand,
  DocCommand,
  InsertNode,
  GroupNodes,
  MoveGroup,
  MoveLayer,
  MoveNode,
  RemoveAsset,
  RemoveAttribute,
  RenameAsset,
  RemoveGroup,
  RemoveLayer,
  RemoveNode,
  ReorderNode,
  ReplaceAssetMarkup,
  ReplaceNode,
  SetAttribute,
  SetAttributes,
  SetIconJsonValue,
  SetText,
  Ungroup,
} from '../app/features/document/commands';
import { smallDocument } from './documents';

/**
 * One case per document command (tests only): `commands.spec` checks do/undo/redo with them,
 * `registry.spec` the JSON round trip (design 005 E15) – every registered type needs a case.
 */
export const a = (id: string) => ({ asset: 'a.svg', id });
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="x()"/></svg>';

function freshSvg(
  doc: IconDocument,
  text = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
) {
  const svg = parseSvg(text)!;
  doc.prepare(svg.root);
  return svg;
}

/** Every command: do changes the document, undo restores it exactly, redo repeats do. */
export const CASES: [string, (doc: IconDocument) => DocCommand][] = [
  ['SetAttribute (new)', () => new SetAttribute(a('n3'), 'stroke', 'blue')],
  ['SetAttribute (existing)', () => new SetAttribute(a('n3'), 'fill', 'blue', 'changeFill')],
  ['SetAttribute (xlink)', () => new SetAttribute(a('n4'), 'xlink:href', '#x')],
  [
    'SetAttributes (gesture result, design 007 E10)',
    () =>
      new SetAttributes(
        [
          { ref: a('n3'), name: 'transform', value: 'translate(1 2)' },
          { ref: a('n3'), name: 'fill', value: 'blue' },
          { ref: a('n4'), name: 'cx', value: '7' },
        ],
        'moveNode',
      ),
  ],
  ['RemoveAttribute', () => new RemoveAttribute(a('n3'), 'fill')],
  ['InsertNode', () => new InsertNode(a('n2'), '<ellipse rx="1" onclick="x()"/>', 0)],
  [
    'SetAttributes (remove + set, design 009 E3)',
    () =>
      new SetAttributes(
        [
          { ref: a('n3'), name: 'fill', value: null },
          { ref: a('n3'), name: 'stroke', value: 'red' },
        ],
        'resetProperty',
      ),
  ],
  // (the rect has no element children; the panel only offers it for `text`)
  ['SetText (design 009 E3)', () => new SetText([{ ref: a('n3'), text: 'Hello' }])],
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
  [
    'ReplaceNode (design 011 E5)',
    () => new ReplaceNode(a('n3'), '<ellipse rx="2" onclick="x()"/>'),
  ],
  ['SetIconJsonValue', () => new SetIconJsonValue(['groups', 0, 'shadow', 'opacity'], 0.2)],
  ['SetIconJsonValue (remove)', () => new SetIconJsonValue(['fill'], undefined)],
  ['AddGroup', () => new AddGroup(newGroup(newLayer('a.svg', 'x')), 0)],
  ['RemoveGroup', () => new RemoveGroup(0)],
  ['MoveGroup', () => new MoveGroup(1, 0)],
  ['AddLayer', () => new AddLayer(0, newLayer('a.svg', 'y'))],
  ['RemoveLayer', () => new RemoveLayer(0, 0)],
  ['MoveLayer', () => new MoveLayer({ group: 0, layer: 0 }, { group: 1, layer: 0 })],
  [
    'ReorderNode (groups)',
    () => new ReorderNode([{ kind: 'group', group: 1 }], { kind: 'group', group: 0 }, 'before'),
  ],
  [
    'ReorderNode (layer into group)',
    () =>
      new ReorderNode([{ kind: 'layer', group: 0, layer: 0 }], { kind: 'group', group: 1 }, 'into'),
  ],
  [
    'ReorderNode (nodes)',
    () =>
      new ReorderNode([{ kind: 'node', ref: a('n4') }], { kind: 'node', ref: a('n3') }, 'before'),
  ],
  [
    'ReorderNode (node into another asset)',
    () =>
      new ReorderNode(
        [{ kind: 'node', ref: a('n3') }],
        { kind: 'layer', group: 1, layer: 0 },
        'into',
      ),
  ],
  ['GroupNodes', () => new GroupNodes([a('n3'), a('n4')])],
  ['Ungroup', () => new Ungroup(a('n2'))],
  ['AddAsset', () => new AddAsset('c.svg', SVG)],
  ['RemoveAsset', () => new RemoveAsset('a.svg')],
  ['RenameAsset', () => new RenameAsset('a.svg', 'renamed.svg')],
  // clip paths (design 014 E5); `commandDocument` has `<clipPath id="c">` (n8) in a.svg
  [
    'InsertDefinition',
    () =>
      new InsertDefinition('a.svg', '<clipPath id="d"><circle r="3" onclick="x()"/></clipPath>'),
  ],
  [
    'InsertDefinition (makes the defs)',
    () => new InsertDefinition('b.svg', '<clipPath id="e"><rect width="2" height="2"/></clipPath>'),
  ],
  ['AssignClip (own)', () => new AssignClip(a('n3'), 'own', 'c')],
  ['SetLayerClip', () => new SetLayerClip('a.svg', 'c')],
  [
    'AssignClip (none: out of the layer clip group)',
    () =>
      new CompositeCommand('assignClip', [
        new InsertNode(a('n1'), '<rect width="1"/>'),
        new SetLayerClip('a.svg', 'c'),
        new AssignClip(a('n2'), 'none'),
      ]),
  ],
  [
    'AssignClip (inherit: back into the group)',
    () =>
      new CompositeCommand('assignClip', [
        new InsertNode(a('n1'), '<rect width="1"/>'),
        new SetLayerClip('a.svg', 'c'),
        new AssignClip(a('n2'), 'own', 'c'),
        new AssignClip(a('n2'), 'inherit'),
      ]),
  ],
  [
    'SetLayerClip (remove)',
    () =>
      new CompositeCommand('layerClip', [
        new InsertNode(a('n1'), '<rect width="1"/>'),
        new SetLayerClip('a.svg', 'c'),
        new SetLayerClip('a.svg', null),
      ]),
  ],
  ['RemoveClipPath (unused)', () => new RemoveClipPath(a('n8'))],
  [
    'RemoveClipPath',
    () =>
      new CompositeCommand('removeClipPath', [
        new SetLayerClip('a.svg', 'c'),
        new AssignClip(a('n3'), 'own', 'c'),
        new RemoveClipPath(a('n8')),
      ]),
  ],
  [
    'CompositeCommand',
    () =>
      new CompositeCommand('importSvg', [
        new AddAsset('c.svg', SVG),
        new AddGroup(newGroup(newLayer('c.svg', 'c'))),
      ]),
  ],
];

export function firstId(doc: IconDocument, asset: string): string {
  return doc.assets.get(asset)!.svg!.root.getAttribute('data-ai-id')!;
}

export function commandDocument(): IconDocument {
  const doc = smallDocument();
  doc.iconJson = {
    ...doc.iconJson,
    groups: [...doc.iconJson.groups!, newGroup(newLayer('b.svg', 'b'))],
  };
  doc.insertAsset({ name: 'b.svg', kind: 'svg', svg: freshSvg(doc) });
  // a clip path in a.svg (design 014): defs n7, clipPath n8, rect n9
  const root = doc.assets.get('a.svg')!.svg!.root;
  const defs = parseSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs></svg>',
  )!.root.firstElementChild!;
  doc.prepare(defs);
  root.append(root.ownerDocument.importNode(defs, true));
  return doc;
}
