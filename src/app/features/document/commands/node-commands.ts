import { IconDocument, NodeRef } from '../icon-document';
import { ID_ATTR, parseFragment } from '../svg/node-ids';
import { UndoLabel } from '../undo/undo-texts';
import { CommandError, DocCommand } from './command';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

function target(doc: IconDocument, ref: NodeRef): Element {
  const el = doc.node(ref);
  if (!el) throw new CommandError(`no node ${ref.asset}#${ref.id}`);
  return el;
}

function sameRef(a: NodeRef, b: NodeRef): boolean {
  return a.asset === b.asset && a.id === b.id;
}

/** `xlink:href` lives in its own namespace; everything else is a plain attribute. */
function readAttr(el: Element, name: string): string | null {
  return name.startsWith('xlink:')
    ? el.getAttributeNS(XLINK_NS, name.slice(6))
    : el.getAttribute(name);
}

function writeAttr(el: Element, name: string, value: string | null): void {
  if (name.startsWith('xlink:')) {
    if (value === null) el.removeAttributeNS(XLINK_NS, name.slice(6));
    else el.setAttributeNS(XLINK_NS, name, value);
  } else if (value === null) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
}

function checkName(name: string): void {
  // internal ids are never changed by commands; handlers never get in (design 003 E4)
  if (!name || name.startsWith('data-ai-') || /^on/i.test(name)) {
    throw new CommandError(`attribute ${name} cannot be set`);
  }
}

/** Sets an attribute (`label` lets property editors name it, e.g. "Change Fill", legacy §12). */
export class SetAttribute implements DocCommand {
  private old: string | null = null;

  constructor(
    readonly ref: NodeRef,
    readonly name: string,
    public value: string,
    readonly label: UndoLabel = 'changeAttribute',
  ) {
    checkName(name);
  }

  do(doc: IconDocument): void {
    const el = target(doc, this.ref);
    this.old = readAttr(el, this.name);
    writeAttr(el, this.name, this.value);
  }

  undo(doc: IconDocument): void {
    writeAttr(target(doc, this.ref), this.name, this.old);
  }

  merge(next: DocCommand): boolean {
    if (
      !(next instanceof SetAttribute) ||
      next.name !== this.name ||
      !sameRef(next.ref, this.ref)
    ) {
      return false;
    }
    this.value = next.value;
    return true;
  }
}

/** All attributes in order – undo of a removal puts the attribute back at its place. */
function attributesOf(el: Element): { ns: string | null; name: string; value: string }[] {
  return Array.from(el.attributes).map((a) => ({
    ns: a.namespaceURI,
    name: a.name,
    value: a.value,
  }));
}

function restoreAttributes(el: Element, list: ReturnType<typeof attributesOf>): void {
  for (const a of Array.from(el.attributes)) el.removeAttributeNode(a);
  for (const a of list) el.setAttributeNS(a.ns, a.name, a.value);
}

export class RemoveAttribute implements DocCommand {
  readonly label = 'removeAttribute';
  private old: ReturnType<typeof attributesOf> = [];

  constructor(
    readonly ref: NodeRef,
    readonly name: string,
  ) {
    checkName(name);
  }

  do(doc: IconDocument): void {
    const el = target(doc, this.ref);
    this.old = attributesOf(el);
    writeAttr(el, this.name, null);
  }

  undo(doc: IconDocument): void {
    restoreAttributes(target(doc, this.ref), this.old);
  }
}

/** Where a node sits: parent + the sibling after it. */
interface Place {
  parent: Element;
  next: Node | null;
}

function placeAt(parent: Element, index: number): Place {
  const kids = parent.children;
  if (index < 0 || index > kids.length) throw new CommandError(`index ${index}`);
  return { parent, next: kids[index] ?? null };
}

/**
 * Inserts SVG markup (one element) as child `index` of `parent` (default: the end). The markup is
 * cleaned and gets fresh ids once; redo puts back the same element.
 */
export class InsertNode implements DocCommand {
  readonly label: UndoLabel;
  private el: Element | null = null;

  constructor(
    readonly parent: NodeRef,
    readonly markup: string,
    readonly index?: number,
    label: UndoLabel = 'insertNode',
  ) {
    this.label = label;
  }

  /** The ref of the inserted element (after `do`). */
  get ref(): NodeRef | null {
    const id = this.el?.getAttribute(ID_ATTR);
    return id ? { asset: this.parent.asset, id } : null;
  }

  do(doc: IconDocument): void {
    const parent = target(doc, this.parent);
    if (!this.el) {
      const el = parseFragment(this.markup);
      if (!el) throw new CommandError('invalid markup');
      doc.prepare(el);
      this.el = parent.ownerDocument.importNode(el, true);
    }
    const at = placeAt(parent, this.index ?? parent.children.length);
    parent.insertBefore(this.el, at.next);
  }

  undo(): void {
    this.el?.remove();
  }
}

/** Removes a node (legacy "Delete"); undo puts it back where it was. */
export class RemoveNode implements DocCommand {
  readonly label = 'delete';
  private el: Element | null = null;
  private place: Place | null = null;

  constructor(readonly ref: NodeRef) {}

  do(doc: IconDocument): void {
    const el = target(doc, this.ref);
    if (!el.parentElement) throw new CommandError('cannot remove the root of an asset');
    this.el = el;
    this.place = { parent: el.parentElement, next: el.nextSibling };
    el.remove();
  }

  undo(): void {
    if (this.el && this.place) this.place.parent.insertBefore(this.el, this.place.next);
  }
}

/**
 * Moves a node to child `index` of `parent` (index counted without the moved node), also into
 * another asset (ids stay unique per document).
 */
export class MoveNode implements DocCommand {
  readonly label: UndoLabel;
  private from: Place | null = null;

  constructor(
    readonly ref: NodeRef,
    readonly parent: NodeRef,
    readonly index: number,
    label: UndoLabel = 'moveNode',
  ) {
    this.label = label;
  }

  do(doc: IconDocument): void {
    const el = target(doc, this.ref);
    const parent = target(doc, this.parent);
    if (!el.parentElement) throw new CommandError('cannot move the root of an asset');
    if (el === parent || el.contains(parent)) throw new CommandError('cannot move into itself');
    this.from = { parent: el.parentElement, next: el.nextSibling };
    el.remove();
    const at = placeAt(parent, this.index);
    parent.insertBefore(parent.ownerDocument.adoptNode(el), at.next);
  }

  undo(doc: IconDocument): void {
    const el = doc.node({ asset: this.parent.asset, id: this.ref.id });
    if (!el || !this.from) return;
    el.remove();
    this.from.parent.insertBefore(this.from.parent.ownerDocument.adoptNode(el), this.from.next);
  }
}
