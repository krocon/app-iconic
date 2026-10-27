import { IconDocument, NodeRef } from '../icon-document';
import {
  clipGroupsOf,
  clipIdOf,
  clipRefOf,
  clipUrl,
  clipUsers,
  findClipPath,
  isClipGroup,
  layerClipOf,
  paintingChildren,
} from '../model/clip-model';
import { isDefinitionElement, isDefinitionTag } from '../model/reorder-rules';
import { parseFragment } from '../svg/node-ids';
import { styleValue, styleWithout } from '../svg/style-props';
import { collectIds } from '../svg/svg-references';
import { UndoLabel } from '../undo/undo-texts';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';
import { InsertNode, MoveNode, RemoveNode, target } from './node-commands';
import { AttributeChange, SetAttributes } from './set-attributes';

/**
 * The clip path commands of design 014 (E5) – serialisable like every command (AI rule). The
 * structural ones plan their steps from the document on the first `do` and record them as basic
 * commands (`MoveNode`, `InsertNode`, `RemoveNode`, `SetAttributes`); redo repeats the SAME steps
 * (same elements, same `data-ai-id`), undo runs them backwards.
 */

abstract class StepCommand implements DocCommand {
  abstract readonly label: UndoLabel;
  private steps: DocCommand[] | null = null;

  /** Plans and runs the steps (`run` executes one and records it). */
  protected abstract plan(doc: IconDocument, run: (c: DocCommand) => void): void;
  abstract toJSON(): CommandJson;

  do(doc: IconDocument): void {
    const done: DocCommand[] = [];
    const run = (c: DocCommand) => {
      c.do(doc);
      done.push(c);
    };
    try {
      if (this.steps) for (const s of this.steps) run(s);
      else this.plan(doc, run);
    } catch (e) {
      for (const c of done.reverse()) c.undo(doc);
      throw e;
    }
    this.steps = done;
  }

  undo(doc: IconDocument): void {
    for (const s of [...(this.steps ?? [])].reverse()) s.undo(doc);
  }
}

function rootOf(doc: IconDocument, asset: string): Element {
  const root = doc.assets.get(asset)?.svg?.root;
  if (!root) throw new CommandError(`no SVG asset ${asset}`);
  return root;
}

function refOf(doc: IconDocument, el: Element): NodeRef {
  const r = doc.refOf(el);
  if (!r) throw new CommandError('element outside the document');
  return r;
}

const indexIn = (parent: Element, el: Element) =>
  Array.prototype.indexOf.call(parent.children, el) as number;

/** The change that sets (or with `null` removes) an element's own clip; its `style` loses it. */
function clipChanges(doc: IconDocument, el: Element, value: string | null): AttributeChange[] {
  const ref = refOf(doc, el);
  const out: AttributeChange[] = [];
  if (el.getAttribute('clip-path') !== value) out.push({ ref, name: 'clip-path', value });
  if (styleValue(el, 'clip-path') !== null || /clip-path\s*:/i.test(el.getAttribute('style') ?? ''))
    out.push({ ref, name: 'style', value: styleWithout(el, 'clip-path') });
  return out;
}

function setClip(doc: IconDocument, run: (c: DocCommand) => void, el: Element, v: string | null) {
  const changes = clipChanges(doc, el, v);
  if (changes.length) run(new SetAttributes(changes, 'assignClip'));
}

/** Markup of a new clip group like `like` (its attributes without `id` / internal ones). */
function groupMarkup(clip: string, like?: Element): string {
  const g = parseFragment('<g/>')!;
  for (const a of Array.from(like?.attributes ?? [])) {
    if (a.name !== 'id' && !a.name.startsWith('data-ai-')) g.setAttribute(a.name, a.value);
  }
  g.setAttribute('clip-path', clipUrl(clip));
  return new XMLSerializer().serializeToString(g);
}

function insertGroup(
  doc: IconDocument,
  run: (c: DocCommand) => void,
  root: Element,
  index: number,
  clip: string,
  like?: Element,
): Element {
  const ins = new InsertNode(refOf(doc, root), groupMarkup(clip, like), index, 'assignClip');
  run(ins);
  return doc.node(ins.ref!)!;
}

/** Moves `el` to child `index` of `parent`. */
function move(
  doc: IconDocument,
  run: (c: DocCommand) => void,
  el: Element,
  parent: Element,
  index: number,
) {
  run(new MoveNode(refOf(doc, el), refOf(doc, parent), index, 'assignClip'));
}

/**
 * Takes `el` out of its clip group onto the layer level (E4): the group is split at it, the
 * children after it go into a new group with the same clip; empty parts go.
 */
function liftOut(doc: IconDocument, run: (c: DocCommand) => void, el: Element, root: Element) {
  const group = el.parentElement!;
  const kids = Array.from(group.children);
  const after = kids.slice(kids.indexOf(el) + 1);
  move(doc, run, el, root, indexIn(root, group) + 1);
  if (after.length) {
    const clip = clipIdOf(group)!;
    const next = insertGroup(doc, run, root, indexIn(root, el) + 1, clip, group);
    after.forEach((k, i) => move(doc, run, k, next, i));
  }
  if (group.children.length === 0) run(new RemoveNode(refOf(doc, group)));
}

/** Puts a layer-level `el` into the neighbouring clip group of `clip` (or a new one), merging. */
function joinLayer(
  doc: IconDocument,
  run: (c: DocCommand) => void,
  el: Element,
  root: Element,
  clip: string,
) {
  const isOurs = (e: Element | null) => !!e && isClipGroup(e, root) && clipIdOf(e) === clip;
  const prev = el.previousElementSibling;
  const next = el.nextElementSibling;
  if (isOurs(prev)) {
    move(doc, run, el, prev!, prev!.children.length);
    if (isOurs(next)) {
      for (const k of Array.from(next!.children)) move(doc, run, k, prev!, prev!.children.length);
      run(new RemoveNode(refOf(doc, next!)));
    }
  } else if (isOurs(next)) {
    move(doc, run, el, next!, 0);
  } else {
    const g = insertGroup(doc, run, root, indexIn(root, el), clip);
    move(doc, run, el, g, 0);
  }
}

/** Moves the children of a clip group to its place and removes it. */
function unwrap(doc: IconDocument, run: (c: DocCommand) => void, group: Element) {
  const parent = group.parentElement!;
  const kids = Array.from(group.children);
  const at = indexIn(parent, group);
  kids.forEach((k, i) => move(doc, run, k, parent, at + i));
  run(new RemoveNode(refOf(doc, group)));
}

/** A clip id the asset has as `<clipPath>`; else an error. */
function existingClip(root: Element, id: string): Element {
  const clip = findClipPath(root, id);
  if (!clip) throw new CommandError(`no clipPath #${id}`);
  return clip;
}

/**
 * Puts a definition element (a `<clipPath>` …) into the `<defs>` of the asset root (E1), which is
 * made as its first child when missing. Its `id` must be free in the asset.
 */
export class InsertDefinition extends StepCommand {
  readonly label: UndoLabel;
  private inserted: NodeRef | null = null;

  constructor(
    readonly asset: string,
    readonly markup: string,
    label: UndoLabel = 'createClipPath',
  ) {
    super();
    this.label = label;
  }

  /** The new element (after `do`). */
  get ref(): NodeRef | null {
    return this.inserted;
  }

  protected plan(doc: IconDocument, run: (c: DocCommand) => void): void {
    const root = rootOf(doc, this.asset);
    const el = parseFragment(this.markup);
    if (!el || !isDefinitionTag(el) || el.localName === 'defs') {
      throw new CommandError('invalid definition');
    }
    const id = el.getAttribute('id');
    if (id && collectIds(root).has(id)) throw new CommandError(`id ${id} is taken`);
    let defs = Array.from(root.children).find((k) => k.localName === 'defs') ?? null;
    if (!defs) {
      const make = new InsertNode(refOf(doc, root), '<defs/>', 0, this.label);
      run(make);
      defs = doc.node(make.ref!)!;
    }
    const ins = new InsertNode(refOf(doc, defs), this.markup, undefined, this.label);
    run(ins);
    this.inserted = ins.ref;
  }

  toJSON(): CommandJson {
    const label = this.label === 'createClipPath' ? undefined : this.label;
    return {
      type: 'insertDefinition',
      asset: this.asset,
      markup: this.markup,
      ...(label ? { label } : {}),
    };
  }
}

export type AssignMode = 'own' | 'none' | 'inherit';

/**
 * The clip of one node (E4): `own` = `clip-path="url(#clip)"` (a direct child of a clip group is
 * taken out of it first, so only its own clip applies), `none` = no clip (out of the clip group;
 * impossible deeper inside a clipped group), `inherit` = no own clip (on the layer level into the
 * layer's clip group).
 */
export class AssignClip extends StepCommand {
  readonly label = 'assignClip';

  constructor(
    readonly ref: NodeRef,
    readonly mode: AssignMode,
    readonly clip?: string,
  ) {
    super();
    if ((mode === 'own') !== (clip !== undefined)) throw new CommandError('invalid command: clip');
  }

  protected plan(doc: IconDocument, run: (c: DocCommand) => void): void {
    const el = target(doc, this.ref);
    const root = rootOf(doc, this.ref.asset);
    if (el === root) throw new CommandError('the asset root cannot be clipped here');
    if (isDefinitionElement(el)) throw new CommandError('definitions are not clipped');
    if (this.mode === 'own') {
      const clip = existingClip(root, this.clip!);
      if (clip.contains(el)) throw new CommandError('a clip path cannot clip its own shape');
    }
    const parent = el.parentElement!;
    const inGroup = isClipGroup(parent, root);
    if (this.mode === 'none' && !inGroup) {
      for (let e: Element | null = parent; e && e !== root; e = e.parentElement) {
        if (clipRefOf(e)) throw new CommandError('inside a clipped group');
      }
    }
    if (clipRefOf(el)) setClip(doc, run, el, null);
    if (this.mode !== 'inherit' && inGroup) liftOut(doc, run, el, root);
    if (this.mode === 'own') setClip(doc, run, el, clipUrl(this.clip!));
    if (this.mode === 'inherit' && el.parentElement === root) {
      const layer = layerClipOf(root);
      if (layer) joinLayer(doc, run, el, root, layer);
    }
  }

  toJSON(): CommandJson {
    return {
      type: 'assignClip',
      ref: { ...this.ref },
      mode: this.mode,
      ...(this.clip !== undefined ? { clip: this.clip } : {}),
    };
  }
}

/**
 * The clip of a layer (E3, E5): `clip` puts every painting child of the asset root into ONE clip
 * group (an existing layer clip is switched to `clip` in all its groups); `null` dissolves every
 * clip group of the layer clip (the children keep their places).
 */
export class SetLayerClip extends StepCommand {
  readonly label = 'layerClip';

  constructor(
    readonly asset: string,
    readonly clip: string | null,
  ) {
    super();
  }

  protected plan(doc: IconDocument, run: (c: DocCommand) => void): void {
    const root = rootOf(doc, this.asset);
    const current = layerClipOf(root);
    if (this.clip === null) {
      if (!current) throw new CommandError('the layer has no clip');
      for (const g of clipGroupsOf(root, current)) unwrap(doc, run, g);
      return;
    }
    existingClip(root, this.clip);
    if (current === this.clip) throw new CommandError('no change');
    if (current) {
      for (const g of clipGroupsOf(root, current)) setClip(doc, run, g, clipUrl(this.clip));
      return;
    }
    const kids = paintingChildren(root);
    const at = kids.length ? indexIn(root, kids[0]) : root.children.length;
    const g = insertGroup(doc, run, root, at, this.clip);
    kids.forEach((k, i) => move(doc, run, k, g, i));
  }

  toJSON(): CommandJson {
    return { type: 'setLayerClip', asset: this.asset, clip: this.clip };
  }
}

/** Deletes a `<clipPath>` with every reference to it (E10): clip groups dissolve, the rest loses its `clip-path`. */
export class RemoveClipPath extends StepCommand {
  readonly label = 'removeClipPath';

  constructor(readonly ref: NodeRef) {
    super();
  }

  protected plan(doc: IconDocument, run: (c: DocCommand) => void): void {
    const clip = target(doc, this.ref);
    if (clip.localName !== 'clipPath') throw new CommandError('no clipPath');
    const root = rootOf(doc, this.ref.asset);
    const id = clip.getAttribute('id');
    for (const user of id ? clipUsers(root, id) : []) {
      if (clip.contains(user)) continue;
      if (isClipGroup(user, root)) unwrap(doc, run, user);
      else setClip(doc, run, user, null);
    }
    run(new RemoveNode(this.ref));
  }

  toJSON(): CommandJson {
    return { type: 'removeClipPath', ref: { ...this.ref } };
  }
}

/** Elements outside `clip` that use it (what deleting it changes). */
export function usersOutside(root: Element, clip: Element): Element[] {
  const id = clip.getAttribute('id');
  return id ? clipUsers(root, id).filter((u) => !clip.contains(u)) : [];
}
