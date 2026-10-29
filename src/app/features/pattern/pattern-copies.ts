import { conjugate, Matrix } from '../../shared/geometry/matrix';
import { matrixText } from '../../shared/geometry/pattern';
import { CompositeCommand, DocCommand, InsertNode, SetAttributes } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { isDefinitionElement } from '../document/model/reorder-rules';
import { UndoLabel } from '../document/undo/undo-texts';
import { stripInternal } from '../document/svg/node-ids';
import { collectIds, renameCollidingIds } from '../document/svg/svg-references';
import { deletableNodes, Planned } from '../hierarchy/edit-operations';

/**
 * The copies of patterns and the linked clone (prompt 049) as one composite command: each copy
 * right after its original (in pattern order) with the placement prepended to its `transform` –
 * the placement is given in document space and expressed in the parent's space, so nested,
 * transformed groups work. Ids of the copies are made unique; clips stay shared (they move with
 * the copy's user space). Pure apart from DOM cloning.
 */

/** The parent's user space → document (`null`: not laid out). */
export type ParentToDocument = (parent: Element) => Matrix | null;

const nodes = (doc: IconDocument, refs: readonly NodeRef[]) =>
  deletableNodes(doc, refs).filter((e) => !isDefinitionElement(e));

/** Copies of the selected nodes at `placements` (document space). */
export function patternCommand(
  doc: IconDocument,
  refs: readonly NodeRef[],
  placements: readonly Matrix[],
  toDoc: ParentToDocument,
  label: UndoLabel,
): Planned | null {
  const els = nodes(doc, refs);
  if (!els.length || !placements.length) return null;
  const taken = new Map<string, Set<string>>();
  const inserts: InsertNode[] = [];
  for (const el of [...els].reverse()) {
    const ref = doc.refOf(el)!;
    const parent = el.parentElement!;
    const p = toDoc(parent);
    if (!p) continue;
    const root = doc.assets.get(ref.asset)!.svg!.root;
    const ids = taken.get(ref.asset) ?? collectIds(root);
    taken.set(ref.asset, ids);
    const index = Array.prototype.indexOf.call(parent.children, el) as number;
    const own = el.getAttribute('transform')?.trim();
    placements.forEach((g, k) => {
      const m = conjugate(g, p);
      if (!m) return;
      const copy = el.cloneNode(true) as Element;
      stripInternal(copy);
      copy.setAttribute('transform', own ? `${matrixText(m)} ${own}` : matrixText(m));
      renameCollidingIds([copy], ids);
      const markup = new XMLSerializer().serializeToString(copy);
      inserts.push(new InsertNode(doc.refOf(parent)!, markup, index + 1 + k, label));
    });
  }
  if (!inserts.length) return null;
  return {
    command: new CompositeCommand(label, inserts),
    selection: () => ({ nodes: inserts.flatMap((i) => (i.ref ? [i.ref] : [])), items: [] }),
  };
}

/**
 * Clone (linked): a `<use href="#id">` right after each selected node – it follows every change
 * of the original. The original gets an id if it has none.
 */
export function linkedCloneCommand(doc: IconDocument, refs: readonly NodeRef[]): Planned | null {
  const els = nodes(doc, refs);
  if (!els.length) return null;
  const taken = new Map<string, Set<string>>();
  const cmds: DocCommand[] = [];
  const inserts: InsertNode[] = [];
  for (const el of [...els].reverse()) {
    const ref = doc.refOf(el)!;
    const root = doc.assets.get(ref.asset)!.svg!.root;
    const ids = taken.get(ref.asset) ?? collectIds(root);
    taken.set(ref.asset, ids);
    let id = el.getAttribute('id');
    if (!id) {
      let n = 1;
      while (ids.has(`${el.localName}-${n}`)) n++;
      id = `${el.localName}-${n}`;
      ids.add(id);
      cmds.push(new SetAttributes([{ ref, name: 'id', value: id }], 'linkedClone'));
    }
    const parent = el.parentElement!;
    const index = Array.prototype.indexOf.call(parent.children, el) as number;
    const ins = new InsertNode(
      doc.refOf(parent)!,
      `<use xmlns="http://www.w3.org/2000/svg" href="#${id}"/>`,
      index + 1,
      'linkedClone',
    );
    inserts.push(ins);
    cmds.push(ins);
  }
  return {
    command: new CompositeCommand('linkedClone', cmds),
    selection: () => ({
      nodes: inserts.flatMap((i) => (i.ref ? [i.ref] : [])).reverse(),
      items: [],
    }),
  };
}
