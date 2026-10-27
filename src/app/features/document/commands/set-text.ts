import { IconDocument, NodeRef } from '../icon-document';
import { CommandError, DocCommand } from './command';
import { CommandJson } from './command-json';
import { sameRef, target } from './node-commands';
import { MAX_CHANGES } from './set-attributes';

/** The text content of one element. */
export interface TextChange {
  ref: NodeRef;
  text: string;
}

/**
 * The text content of `text` elements (design 009 E3, "Change Text" of legacy §12) – one or more
 * elements as one step, serialisable (`setText`). Only elements without element children: a
 * `tspan` structure is never flattened (that is "Edit SVG…", prompt 011). `merge` takes over a
 * following command with the same targets, so typing is one step.
 */
export class SetText implements DocCommand {
  readonly label = 'changeText';
  private old: string[] = [];
  readonly changes: TextChange[];

  constructor(changes: readonly TextChange[]) {
    if (changes.length === 0 || changes.length > MAX_CHANGES) {
      throw new CommandError('invalid command: changes');
    }
    const seen = new Set<string>();
    for (const c of changes) {
      const key = `${c.ref.asset}\u0000${c.ref.id}`;
      if (seen.has(key)) throw new CommandError('duplicate change');
      seen.add(key);
    }
    this.changes = changes.map((c) => ({ ref: { ...c.ref }, text: c.text }));
  }

  do(doc: IconDocument): void {
    const els = this.changes.map((c) => target(doc, c.ref));
    for (const el of els) {
      if (el.children.length > 0) throw new CommandError('element has child elements');
    }
    this.old = els.map((el) => el.textContent ?? '');
    this.changes.forEach((c, i) => (els[i].textContent = c.text));
  }

  undo(doc: IconDocument): void {
    this.changes.forEach((c, i) => (target(doc, c.ref).textContent = this.old[i]));
  }

  merge(next: DocCommand): boolean {
    if (!(next instanceof SetText) || next.changes.length !== this.changes.length) return false;
    if (!this.changes.every((c, i) => sameRef(c.ref, next.changes[i].ref))) return false;
    this.changes.forEach((c, i) => (c.text = next.changes[i].text));
    return true;
  }

  toJSON(): CommandJson {
    return {
      type: 'setText',
      changes: this.changes.map((c) => ({ ref: { ...c.ref }, text: c.text })),
    };
  }
}
