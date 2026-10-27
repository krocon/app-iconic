import { IconDocument, NodeRef } from '../icon-document';
import { UndoLabel } from '../undo/undo-texts';
import { CommandError, DocCommand } from './command';
import { CommandJson, opt } from './command-json';
import {
  attributesOf,
  checkName,
  readAttr,
  restoreAttributes,
  sameRef,
  target,
  writeAttr,
} from './node-commands';

/** One attribute of one node; `null` removes it (Reset, `style` without a property – design 009 E3). */
export interface AttributeChange {
  ref: NodeRef;
  name: string;
  value: string | null;
}

/** Most attributes one command may change. */
export const MAX_CHANGES = 10_000;

/**
 * Several attributes of several nodes as ONE step (design 007 E10): the result of a canvas gesture
 * (drag a handle, move a selection, scale a box, nudge) – serialisable like every command (AI
 * rule). `merge` takes over a following command with the same targets (refs + names in the same
 * order) and keeps the values before the first, so a committed gesture is one `setAttributes` with
 * the end values. Undo writes the old values back (missing ones are removed again). A `null` value
 * removes the attribute (design 009 E3).
 */
export class SetAttributes implements DocCommand {
  private old: (string | null)[] = [];
  /** All attributes of elements that lose one (undo puts it back at its place). */
  private whole = new Map<Element, ReturnType<typeof attributesOf>>();
  readonly changes: AttributeChange[];

  constructor(
    changes: readonly AttributeChange[],
    readonly label: UndoLabel = 'changeAttribute',
  ) {
    if (changes.length === 0 || changes.length > MAX_CHANGES) {
      throw new CommandError('invalid command: changes');
    }
    const seen = new Set<string>();
    for (const c of changes) {
      checkName(c.name);
      const key = `${c.ref.asset}\u0000${c.ref.id}\u0000${c.name}`;
      if (seen.has(key)) throw new CommandError(`duplicate change ${c.name}`);
      seen.add(key);
    }
    this.changes = changes.map((c) => ({ ref: { ...c.ref }, name: c.name, value: c.value }));
  }

  do(doc: IconDocument): void {
    const els = this.changes.map((c) => target(doc, c.ref)); // all targets first: nothing half done
    this.old = this.changes.map((c, i) => readAttr(els[i], c.name));
    this.whole = new Map();
    this.changes.forEach((c, i) => {
      if (c.value === null && !this.whole.has(els[i])) this.whole.set(els[i], attributesOf(els[i]));
    });
    this.changes.forEach((c, i) => writeAttr(els[i], c.name, c.value));
  }

  undo(doc: IconDocument): void {
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const c = this.changes[i];
      writeAttr(target(doc, c.ref), c.name, this.old[i]);
    }
    for (const [el, attrs] of this.whole) restoreAttributes(el, attrs);
  }

  merge(next: DocCommand): boolean {
    if (!(next instanceof SetAttributes) || next.changes.length !== this.changes.length)
      return false;
    const fits = this.changes.every(
      (c, i) => c.name === next.changes[i].name && sameRef(c.ref, next.changes[i].ref),
    );
    if (!fits) return false;
    this.changes.forEach((c, i) => (c.value = next.changes[i].value));
    return true;
  }

  toJSON(): CommandJson {
    const label = this.label === 'changeAttribute' ? undefined : this.label;
    return {
      type: 'setAttributes',
      changes: this.changes.map((c) => ({ ref: { ...c.ref }, name: c.name, value: c.value })),
      ...opt('label', label),
    };
  }
}
