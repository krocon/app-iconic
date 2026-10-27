import { svgDocument } from '../../../../testing/documents';
import { IconDocument, NodeRef } from '../icon-document';
import { serializeAsset } from '../svg/node-ids';
import { AssignClip, InsertDefinition, RemoveClipPath, SetLayerClip } from './clip-commands';
import { CommandError, CompositeCommand, DocCommand } from './command';
import { commandFromJson } from './registry';

const DEFS =
  '<defs><clipPath id="c"><rect width="50" height="100"/></clipPath><clipPath id="k"><circle r="9"/></clipPath></defs>';

function setup(body: string) {
  const doc = svgDocument(body);
  const root = doc.assets.get('a.svg')!.svg!.root;
  const ref = (id: string): NodeRef => doc.refOf(root.querySelector(`[id="${id}"]`)!)!;
  /** The asset's content between `<svg …>` and `</svg>`, without the defs. */
  const body_ = () =>
    serializeAsset(doc.assets.get('a.svg')!.svg!)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .replace(/<defs>.*<\/defs>/, '')
      .replace(/ xmlns="[^"]*"/g, '');
  return { doc, root, ref, body: body_ };
}

/** Runs `cmd`, checks undo → before and redo → the same result; returns the result. */
function check(doc: IconDocument, cmd: DocCommand, body: () => string): string {
  const before = doc.snapshot();
  cmd.do(doc);
  const after = doc.snapshot();
  const result = body();
  cmd.undo(doc);
  expect(doc.snapshot()).toBe(before);
  cmd.do(doc);
  expect(doc.snapshot()).toBe(after);
  // and the same from JSON
  const again = commandFromJson(JSON.parse(JSON.stringify(cmd.toJSON())));
  cmd.undo(doc);
  again.do(doc);
  expect(body()).toBe(result);
  again.undo(doc);
  expect(doc.snapshot()).toBe(before);
  cmd.do(doc);
  return result;
}

describe('clip commands (design 014 E4, E5)', () => {
  it('setLayerClip wraps every painting child into one clip group, null dissolves it', () => {
    const t = setup(`<rect id="a"/>${DEFS}<g id="b"><rect/></g><circle id="d"/>`);
    const on = check(t.doc, new SetLayerClip('a.svg', 'c'), t.body);
    expect(on).toBe(
      '<g clip-path="url(#c)"><rect id="a"/><g id="b"><rect/></g><circle id="d"/></g>',
    );
    const off = check(t.doc, new SetLayerClip('a.svg', null), t.body);
    expect(off).toBe('<rect id="a"/><g id="b"><rect/></g><circle id="d"/>');
  });

  it('setLayerClip switches an existing layer clip in all its groups', () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a"/></g><rect id="x"/><g clip-path="url(#c)"><rect id="b"/></g>`,
    );
    expect(check(t.doc, new SetLayerClip('a.svg', 'k'), t.body)).toBe(
      '<g clip-path="url(#k)"><rect id="a"/></g><rect id="x"/><g clip-path="url(#k)"><rect id="b"/></g>',
    );
  });

  it('none splits the clip group at the node – order and the others stay', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/><rect id="b"/><rect id="d"/></g>`);
    expect(check(t.doc, new AssignClip(t.ref('b'), 'none'), t.body)).toBe(
      '<g clip-path="url(#c)"><rect id="a"/></g><rect id="b"/><g clip-path="url(#c)"><rect id="d"/></g>',
    );
  });

  it('none on the first / last child leaves no empty group', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/><rect id="b"/></g>`);
    expect(check(t.doc, new AssignClip(t.ref('a'), 'none'), t.body)).toBe(
      '<rect id="a"/><g clip-path="url(#c)"><rect id="b"/></g>',
    );
    expect(check(t.doc, new AssignClip(t.ref('b'), 'none'), t.body)).toBe(
      '<rect id="a"/><rect id="b"/>',
    );
  });

  it('inherit puts a layer-level node back and merges the parts', () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a"/></g><rect id="b" clip-path="url(#k)"/><g clip-path="url(#c)"><rect id="d"/></g>`,
    );
    expect(check(t.doc, new AssignClip(t.ref('b'), 'inherit'), t.body)).toBe(
      '<g clip-path="url(#c)"><rect id="a"/><rect id="b"/><rect id="d"/></g>',
    );
  });

  it('inherit without a neighbouring group makes one; without a layer clip it only drops its own', () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a"/></g><circle/><rect id="b" style="fill:red;clip-path:url(#k)"/>`,
    );
    expect(check(t.doc, new AssignClip(t.ref('b'), 'inherit'), t.body)).toBe(
      '<g clip-path="url(#c)"><rect id="a"/></g><circle/><g clip-path="url(#c)"><rect id="b" style="fill:red"/></g>',
    );
    const u = setup(`${DEFS}<rect id="b" clip-path="url(#k)"/>`);
    expect(check(u.doc, new AssignClip(u.ref('b'), 'inherit'), u.body)).toBe('<rect id="b"/>');
  });

  it('own overrides the layer clip: out of the group, then its own reference', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/><rect id="b"/></g>`);
    expect(check(t.doc, new AssignClip(t.ref('a'), 'own', 'k'), t.body)).toBe(
      '<rect id="a" clip-path="url(#k)"/><g clip-path="url(#c)"><rect id="b"/></g>',
    );
  });

  it('own deeper inside a group intersects (SVG) and stays in place', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><g><rect id="a"/></g></g>`);
    expect(check(t.doc, new AssignClip(t.ref('a'), 'own', 'k'), t.body)).toBe(
      '<g clip-path="url(#c)"><g><rect id="a" clip-path="url(#k)"/></g></g>',
    );
  });

  it.each([
    [
      'none inside a clipped group',
      `<g clip-path="url(#c)"><g><rect id="a"/></g></g>`,
      'none',
      undefined,
    ],
    ['a missing clip', '<rect id="a"/>', 'own', 'nope'],
    ['a clip on its own shape', '', 'own', 'c'],
  ])('refuses %s (nothing changes)', (_name, body, mode, clip) => {
    const t = setup(`${DEFS}${body}`);
    const target = body ? t.ref('a') : t.doc.refOf(t.root.querySelector('#c rect')!)!;
    const before = t.doc.snapshot();
    expect(() => new AssignClip(target, mode as 'own', clip).do(t.doc)).toThrow(CommandError);
    expect(t.doc.snapshot()).toBe(before);
  });

  it('insertDefinition goes into the root defs (made if missing); ids must be free', () => {
    const t = setup('<rect id="a"/>');
    const cmd = new InsertDefinition(
      'a.svg',
      '<clipPath id="n"><rect width="1" height="1"/></clipPath>',
    );
    check(t.doc, cmd, t.body);
    const svg = serializeAsset(t.doc.assets.get('a.svg')!.svg!);
    expect(svg).toContain(
      '<defs><clipPath id="n"><rect width="1" height="1"/></clipPath></defs><rect id="a"/>',
    );
    expect(t.doc.node(cmd.ref!)!.localName).toBe('clipPath');
    expect(() => new InsertDefinition('a.svg', '<clipPath id="a"/>').do(t.doc)).toThrow(
      CommandError,
    );
    expect(() => new InsertDefinition('a.svg', '<rect/>').do(t.doc)).toThrow(CommandError);
  });

  it('removeClipPath removes every reference and dissolves its clip groups (E10)', () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a" style="clip-path:url(#c)"/></g><rect id="b" clip-path="url(#c)"/><rect id="d" clip-path="url(#k)"/>`,
    );
    const clip = t.doc.refOf(t.root.querySelector('#c')!)!;
    const out = check(t.doc, new RemoveClipPath(clip), t.body);
    expect(out).toBe('<rect id="a"/><rect id="b"/><rect id="d" clip-path="url(#k)"/>');
    expect(t.root.querySelector('#c')).toBeNull();
  });

  it('create = composite of insertDefinition + assign, serialisable as a whole', () => {
    const t = setup('<rect id="a"/><rect id="b"/>');
    const create = new CompositeCommand('createClipPath', [
      new InsertDefinition(
        'a.svg',
        '<clipPath id="clip"><rect width="100" height="100"/></clipPath>',
      ),
      new SetLayerClip('a.svg', 'clip'),
    ]);
    expect(check(t.doc, create, t.body)).toBe(
      '<g clip-path="url(#clip)"><rect id="a"/><rect id="b"/></g>',
    );
  });
});
