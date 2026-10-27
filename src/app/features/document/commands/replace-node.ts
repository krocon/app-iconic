import { IconDocument, NodeRef } from '../icon-document';
import { ID_ATTR, parseFragment } from '../svg/node-ids';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';
import { target } from './node-commands';

/**
 * Replaces one node by new markup ("Edit SVG…", design 011 E5): the markup (exactly one element)
 * is cleaned and gets fresh ids once (`prepare`, design 003 E4); the new element takes the place of
 * the old one. Undo puts back the old element with its ids, redo the same new one. The root of an
 * asset is no target – that is `replaceAssetMarkup`.
 */
export class ReplaceNode implements DocCommand {
  readonly label = 'editSvgCode';
  private next: Element | null = null;
  private old: Element | null = null;

  constructor(
    readonly ref: NodeRef,
    readonly markup: string,
  ) {}

  /** The ref of the new element (after `do`). */
  get newRef(): NodeRef | null {
    const id = this.next?.getAttribute(ID_ATTR);
    return id ? { asset: this.ref.asset, id } : null;
  }

  do(doc: IconDocument): void {
    const el = target(doc, this.ref);
    if (!el.parentElement) throw new CommandError('the root of an asset is replaced as asset');
    if (!this.next) {
      const parsed = parseFragment(this.markup);
      if (!parsed) throw new CommandError('invalid markup');
      doc.prepare(parsed);
      this.next = el.ownerDocument.importNode(parsed, true);
    }
    this.old = el;
    el.replaceWith(this.next);
  }

  undo(): void {
    if (this.old && this.next) this.next.replaceWith(this.old);
  }

  toJSON(): CommandJson {
    return { type: 'replaceNode', ref: { ...this.ref }, markup: this.markup };
  }
}
