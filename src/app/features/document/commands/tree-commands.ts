import { IconJson } from '../../../core/icon-file/icon-file.models';
import { IconDocument, NodeRef } from '../icon-document';
import {
  checkReorder,
  nodeDestination,
  reorderIconJson,
  topLevelElements,
} from '../model/reorder-rules';
import { DropPosition, TreeTarget } from '../model/selection';
import { ID_ATTR, SVG_NS } from '../svg/node-ids';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';
import { MoveNode } from './node-commands';

function copyTarget(t: TreeTarget): TreeTarget {
  return t.kind === 'node' ? { kind: 'node', ref: { ...t.ref } } : { ...t };
}

function refOrThrow(doc: IconDocument, el: Element): NodeRef {
  const r = doc.refOf(el);
  if (!r) throw new CommandError('element outside the document');
  return r;
}

/**
 * "Reorder Node" (design 006 E6): moves groups, layers or SVG nodes before / after / into a
 * target – one command for drag & drop, Move Up/Down/Into/Out and the AI. Checked with the rules
 * of `reorder-rules.ts` when it runs. Groups and layers change `icon.json` as one value (exact
 * undo); nodes move one by one with `MoveNode` (also into another asset).
 */
export class ReorderNode implements DocCommand {
  readonly label = 'reorderNode';
  /** Where the sources are after `do` (for the selection). */
  moved: TreeTarget[] = [];
  private before: IconJson | null = null;
  private after: IconJson | null = null;
  private moves: MoveNode[] = [];

  constructor(
    readonly sources: readonly TreeTarget[],
    readonly target: TreeTarget,
    readonly position: DropPosition,
  ) {}

  do(doc: IconDocument): void {
    const err = checkReorder(doc, this.sources, this.target, this.position);
    if (err) throw new CommandError(`cannot reorder: ${err}`);
    if (this.sources[0].kind !== 'node') {
      const r = reorderIconJson(doc.iconJson, this.sources, this.target, this.position);
      this.before = doc.iconJson;
      this.after = r.json;
      this.moved = r.moved;
      doc.iconJson = r.json;
      return;
    }
    const refs = this.sources.map((s) => (s as { ref: NodeRef }).ref);
    const els = topLevelElements(doc, refs);
    const order = this.position === 'after' ? [...els].reverse() : els;
    this.moves = [];
    try {
      for (const el of order) {
        const dest = nodeDestination(doc, el, this.target, this.position);
        if (!dest) throw new CommandError('no destination');
        const move = new MoveNode(refOrThrow(doc, el), refOrThrow(doc, dest.parent), dest.index);
        move.do(doc);
        this.moves.push(move);
      }
    } catch (e) {
      this.undo(doc);
      throw e;
    }
    this.moved = els.map((el) => ({ kind: 'node', ref: refOrThrow(doc, el) }));
  }

  undo(doc: IconDocument): void {
    if (this.before) {
      doc.iconJson = this.before;
      return;
    }
    for (const m of [...this.moves].reverse()) m.undo(doc);
    this.moves = [];
  }

  toJSON(): CommandJson {
    return {
      type: 'reorder',
      sources: this.sources.map(copyTarget),
      target: copyTarget(this.target),
      position: this.position,
    };
  }
}

interface Place {
  parent: Node;
  next: Node | null;
}

/**
 * "Group <g>" (design 006 E11, legacy `groupNodes`): a new `<g>` where the first of the nodes is,
 * the nodes (one asset) go into it in document order. Redo puts back the same `<g>`.
 */
export class GroupNodes implements DocCommand {
  readonly label = 'groupNodes';
  private g: Element | null = null;
  private places: { el: Element; place: Place }[] = [];

  constructor(readonly refs: readonly NodeRef[]) {}

  /** The new group (after `do`). */
  get ref(): NodeRef | null {
    const id = this.g?.getAttribute(ID_ATTR);
    return id && this.refs[0] ? { asset: this.refs[0].asset, id } : null;
  }

  do(doc: IconDocument): void {
    if (this.refs.length === 0) throw new CommandError('nothing to group');
    if (this.refs.some((r) => r.asset !== this.refs[0].asset)) {
      throw new CommandError('nodes of different assets');
    }
    if (this.refs.some((r) => !doc.node(r))) throw new CommandError('missing node');
    const els = topLevelElements(doc, this.refs);
    const first = els[0];
    if (els.some((e) => !e.parentElement)) throw new CommandError('cannot group the root');
    if (!this.g) {
      this.g = first.ownerDocument.createElementNS(SVG_NS, 'g');
      this.g.setAttribute(ID_ATTR, doc.nextId());
    }
    this.places = els.map((el) => ({
      el,
      place: { parent: el.parentNode!, next: el.nextSibling },
    }));
    first.parentNode!.insertBefore(this.g, first);
    for (const el of els) this.g.append(el);
  }

  undo(): void {
    for (const { el, place } of [...this.places].reverse()) {
      place.parent.insertBefore(el, place.next);
    }
    this.g?.remove();
  }

  toJSON(): CommandJson {
    return { type: 'groupNodes', refs: this.refs.map((r) => ({ ...r })) };
  }
}

/** Attributes a `<g>` may have to be ungrouped without losing anything (design 006 E11). */
export function canUngroup(el: Element | null): boolean {
  if (!el || el.localName !== 'g' || !el.parentElement) return false;
  return el
    .getAttributeNames()
    .every((n) => n === 'id' || n === 'transform' || n.startsWith('data-ai-'));
}

/** "Ungroup": the children take the place of the `<g>`, its `transform` goes in front of theirs. */
export class Ungroup implements DocCommand {
  readonly label = 'ungroup';
  private g: Element | null = null;
  private place: Place | null = null;
  private kids: { node: Node; transform: string | null }[] = [];

  constructor(readonly ref: NodeRef) {}

  /** The former children (after `do`). */
  childRefs(): NodeRef[] {
    return this.kids.flatMap((k) => {
      const id = k.node instanceof Element ? k.node.getAttribute(ID_ATTR) : null;
      return id ? [{ asset: this.ref.asset, id }] : [];
    });
  }

  do(doc: IconDocument): void {
    const g = doc.node(this.ref);
    if (!g || !canUngroup(g)) throw new CommandError('cannot ungroup');
    const t = g.getAttribute('transform');
    this.g = g;
    this.place = { parent: g.parentNode!, next: g.nextSibling };
    this.kids = Array.from(g.childNodes).map((node) => ({
      node,
      transform: node instanceof Element ? node.getAttribute('transform') : null,
    }));
    for (const k of this.kids) {
      if (t && k.node instanceof Element) {
        k.node.setAttribute('transform', k.transform ? `${t} ${k.transform}` : t);
      }
      g.parentNode!.insertBefore(k.node, g);
    }
    g.remove();
  }

  undo(): void {
    if (!this.g || !this.place) return;
    for (const k of this.kids) {
      if (k.node instanceof Element) {
        if (k.transform === null) k.node.removeAttribute('transform');
        else k.node.setAttribute('transform', k.transform);
      }
      this.g.append(k.node);
    }
    this.place.parent.insertBefore(this.g, this.place.next);
  }

  toJSON(): CommandJson {
    return { type: 'ungroup', ref: { ...this.ref } };
  }
}
