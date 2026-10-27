import { TestBed } from '@angular/core/testing';
import { svgDocument } from '../../../testing/documents';
import { fakeBackend } from '../../../testing/providers';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { AskService } from '../../shared/ask/ask.service';
import { DocumentStore } from '../document/document.store';
import { IconDocument, NodeRef } from '../document/icon-document';
import { serializeAsset } from '../document/svg/node-ids';
import { FilesService } from '../files/files.service';
import { EditService } from '../hierarchy/edit.service';
import { registerEditActions } from '../hierarchy/edit-actions';
import { DialogService } from '../../shared/dialog/dialog.service';
import { buildTree, TreeNode } from '../hierarchy/hierarchy-model';
import { registerClipActions } from './clip-actions';
import { clipPanel, clipTargetOf } from './clip-panel-model';
import { ClipPathSection } from './clip-path-section';
import { ClipService } from './clip.service';

const DEFS =
  '<defs><clipPath id="c"><rect width="50" height="100"/></clipPath><clipPath id="k"><circle r="9"/></clipPath></defs>';

/** Content of a.svg between `<svg …>` and `</svg>`. */
function body(doc: IconDocument): string {
  return serializeAsset(doc.assets.get('a.svg')!.svg!)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<defs>[\s\S]*<\/defs>/, '')
    .replace(/ xmlns="[^"]*"/g, '');
}

const tick = () => new Promise((r) => setTimeout(r));

function setup(content: string) {
  TestBed.configureTestingModule({
    providers: [...fakeBackend().providers, { provide: OS, useValue: 'other' }],
  });
  const doc = svgDocument(content);
  const store = new DocumentStore(doc);
  TestBed.inject(FilesService).store.set(store);
  const actions = TestBed.inject(ActionService);
  const clip = TestBed.inject(ClipService);
  registerClipActions(actions, clip);
  registerEditActions(actions, TestBed.inject(EditService), TestBed.inject(DialogService));
  const root = doc.assets.get('a.svg')!.svg!.root;
  const ref = (id: string): NodeRef => doc.refOf(root.querySelector(`[id="${id}"]`)!)!;
  return { doc, store, actions, clip, root, ref, ask: TestBed.inject(AskService) };
}

describe('clip panel model (design 014 E13)', () => {
  it('a node: picker value, options, hints', () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a"/><g><rect id="d"/></g></g><rect id="b" clip-path="url(#k)"/>`,
    );
    const panel = (id: string) => clipPanel(t.doc, clipTargetOf(t.doc, [t.ref(id)], [])!);
    const a = panel('a');
    expect(a.value).toBe('inherit');
    expect(a.options.map((o) => o.value)).toEqual(['none', 'inherit', '#c', '#k']);
    expect(a.hint).toBe('Clipped by the layer clip #c');
    expect(a.clip).toMatchObject({ id: 'c', users: 1, units: 'userSpaceOnUse', owned: true });
    const d = panel('d');
    expect(d.options[0].disabled).toBe(true);
    expect(d.hint).toContain('Inside a clipped group');
    expect(panel('b')).toMatchObject({ value: '#k', hint: null });
  });

  it('a layer and a clip', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/></g>`);
    const layer = clipPanel(
      t.doc,
      clipTargetOf(t.doc, [], [{ kind: 'layer', group: 0, layer: 0 }])!,
    );
    expect(layer.value).toBe('#c');
    expect(layer.options.map((o) => o.value)).toEqual(['none', '#c', '#k']);
    const shape = t.doc.refOf(t.root.querySelector('#k circle')!)!;
    const clip = clipPanel(t.doc, clipTargetOf(t.doc, [shape], [])!);
    expect(clip.target.kind).toBe('clip');
    expect(clip.clip).toMatchObject({ id: 'k', users: 0, owned: false });
  });
});

describe('ClipService and clip.* actions (design 014 E5–E14)', () => {
  it('clip.create for a layer: canvas rectangle, wrapped in a clip group, one undo step', () => {
    const t = setup('<rect id="a"/><rect id="b"/>');
    t.store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    expect(t.actions.run('clip.create')).toBe(true);
    expect(serializeAsset(t.doc.assets.get('a.svg')!.svg!)).toContain(
      '<defs><clipPath id="clip"><rect x="0" y="0" width="100" height="100"/></clipPath></defs>',
    );
    expect(body(t.doc)).toContain('<g clip-path="url(#clip)"><rect id="a"/><rect id="b"/></g>');
    expect(t.store.undoLabel()).toContain('Create Clip Path');
    t.store.undo();
    expect(body(t.doc)).toBe('<rect id="a"/><rect id="b"/>');
  });

  it('the AI: create a circle clip for a node by ref, assign, none, inherit', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/><rect id="b"/></g>`);
    const node = t.ref('a');
    t.actions.run('clip.create', { node, shape: 'circle', id: 'round' });
    expect(body(t.doc)).toContain(
      '<rect id="a" clip-path="url(#round)"/><g clip-path="url(#c)"><rect id="b"/></g>',
    );
    expect(serializeAsset(t.doc.assets.get('a.svg')!.svg!)).toContain(
      '<clipPath id="round"><circle cx="50" cy="50" r="50"/>',
    );
    t.actions.run('clip.assign', { node, mode: 'inherit' });
    expect(body(t.doc)).toContain('<g clip-path="url(#c)"><rect id="a"/><rect id="b"/></g>');
    t.actions.run('clip.assign', { node: t.ref('b'), clip: 'k' });
    expect(body(t.doc)).toContain(
      '<g clip-path="url(#c)"><rect id="a"/></g><rect id="b" clip-path="url(#k)"/>',
    );
    t.actions.run('clip.assign', { layer: { group: 0, layer: 0 }, mode: 'none' });
    expect(body(t.doc)).toContain('<rect id="a"/><rect id="b" clip-path="url(#k)"/>');
  });

  it('refuses bad arguments without changing anything', () => {
    const t = setup(`${DEFS}<rect id="a"/>`);
    const before = t.doc.snapshot();
    expect(t.clip.create({ node: t.ref('a'), id: 'c' })).toBe(false); // taken
    expect(t.clip.create({ node: { asset: 'a.svg', id: 'x' } })).toBe(false);
    expect(t.clip.assign({ node: t.ref('a'), clip: 'missing' })).toBe(false);
    expect(t.doc.snapshot()).toBe(before);
    expect(TestBed.inject(FilesService).notice()).toBe('The clip path could not be changed.');
  });

  it('the picker of the section runs the same functions', async () => {
    const t = setup(`${DEFS}<rect id="a"/>`);
    t.store.select([t.ref('a')]);
    const fixture = TestBed.createComponent(ClipPathSection);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const picker = el.querySelector<HTMLSelectElement>('[data-testid="clip-picker"]')!;
    expect(picker.value).toBe('none');
    picker.value = '#k';
    picker.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(body(t.doc)).toContain('<rect id="a" clip-path="url(#k)"/>');
    expect(el.querySelector('[data-testid="clip-users"]')!.textContent).toContain(
      '#k · Used by 1 element',
    );
    expect(el.querySelector('[data-testid="clip-edit"]')).not.toBeNull();
  });

  it('clip.edit enters the mode with the first shape selected; clip.done leaves it', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/></g>`);
    t.store.select([t.ref('a')]);
    expect(t.actions.run('clip.edit')).toBe(true);
    const clip = t.doc.refOf(t.root.querySelector('#c')!)!;
    expect(t.clip.editing.target()).toEqual(clip);
    expect(t.store.selection()).toEqual([t.doc.refOf(t.root.querySelector('#c rect')!)]);
    expect(t.actions.enabled('clip.done')).toBe(true);
    t.actions.run('clip.done');
    expect(t.clip.editing.target()).toBeNull();
    // by id for the AI
    t.actions.run('clip.edit', { clip: 'k', asset: 'a.svg' });
    expect(t.clip.editing.target()).toEqual(t.doc.refOf(t.root.querySelector('#k')!));
  });

  it('clip.remove asks when the clip is used and removes the references', async () => {
    const t = setup(
      `${DEFS}<g clip-path="url(#c)"><rect id="a"/></g><rect id="b" clip-path="url(#c)"/>`,
    );
    t.store.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    const done = t.clip.remove();
    await tick();
    expect(t.ask.current()!.title).toBe('Delete Clip Path “c”?');
    expect(t.ask.current()!.message).toContain('2 elements use it');
    t.ask.answer('delete');
    expect(await done).toBe(true);
    expect(body(t.doc)).toBe('<rect id="a"/><rect id="b"/>');
    expect(t.root.querySelector('#c')).toBeNull();
    // the AI without the question
    t.store.undo();
    expect(await t.clip.remove({ clip: 'c', asset: 'a.svg', confirm: false })).toBe(true);
    expect(t.root.querySelector('#c')).toBeNull();
  });

  it('clip.setUnits converts with the owner’s box (E8)', () => {
    const t = setup(`${DEFS}<rect id="a" clip-path="url(#c)"/>`);
    const owner = t.root.querySelector('#a') as unknown as SVGGraphicsElement;
    owner.getBBox = () => ({ x: 10, y: 20, width: 200, height: 50 }) as DOMRect;
    t.store.select([t.ref('a')]);
    expect(t.actions.run('clip.setUnits', { units: 'objectBoundingBox' })).toBe(true);
    const clip = t.root.querySelector('#c')!;
    expect(clip.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(clip.getAttribute('transform')).toBe('matrix(0.005 0 0 0.02 -0.05 -0.4)');
    expect(t.store.undoLabel()).toContain('Change Clip Path Units');
    t.store.undo();
    expect(clip.getAttribute('transform')).toBeNull();
  });
});

describe('references when copying, duplicating, deleting (design 014 E10)', () => {
  it('Duplicate copies the clip with a new id', () => {
    const t = setup(`${DEFS}<rect id="a" clip-path="url(#k)"/>`);
    t.store.select([t.ref('a')]);
    t.actions.run('edit.duplicate');
    const svg = serializeAsset(t.doc.assets.get('a.svg')!.svg!);
    expect(svg).toContain('<clipPath id="k-2"><circle r="9"/></clipPath>');
    expect(body(t.doc)).toContain(
      '<rect id="a" clip-path="url(#k)"/><rect id="a-2" clip-path="url(#k-2)"/>',
    );
    t.store.undo();
    expect(t.root.querySelector('#k-2')).toBeNull();
  });

  it('Copy takes the clips along as <defs>; Paste puts them into the root defs', async () => {
    const t = setup(`${DEFS}<g id="g"><rect id="a" clip-path="url(#k)"/></g>`);
    const edit = TestBed.inject(EditService);
    t.store.select([t.ref('a')]);
    const text = edit.copyText()!;
    expect(text.replace(/ xmlns="[^"]*"/g, '')).toContain(
      '<defs><clipPath id="k"><circle r="9"/></clipPath></defs>',
    );
    t.store.select([t.ref('g')]);
    expect(await edit.paste(text)).toBe(true);
    const svg = serializeAsset(t.doc.assets.get('a.svg')!.svg!);
    expect(svg).toContain('<clipPath id="k-2"><circle r="9"/></clipPath></defs>');
    expect(body(t.doc)).toContain('<rect id="a-2" clip-path="url(#k-2)"/></g>');
    expect(t.doc.node(t.ref('g'))!.querySelector('defs')).toBeNull();
  });

  it('Delete of a used clip asks and removes the references in the same step', async () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a"/></g>`);
    t.store.select([t.doc.refOf(t.root.querySelector('#c')!)!]);
    t.actions.run('edit.delete');
    await tick();
    expect(t.ask.current()!.title).toBe('Delete Clip Path “c”?');
    t.ask.answer('delete');
    await tick();
    expect(body(t.doc)).toBe('<rect id="a"/>');
    t.store.undo();
    expect(body(t.doc)).toBe('<g clip-path="url(#c)"><rect id="a"/></g>');
  });

  it('the tree marks own clips and names clip groups (E12)', () => {
    const t = setup(`${DEFS}<g clip-path="url(#c)"><rect id="a" clip-path="url(#k)"/></g>`);
    const layer = buildTree(t.doc).children[0].children[0];
    const group = layer.children.find((n: TreeNode) => n.kind === 'node')!;
    expect(group.label).toBe('Layer Clip · 1');
    expect(group.clip).toBe('c');
    expect(group.children[0].clip).toBe('k');
  });
});
