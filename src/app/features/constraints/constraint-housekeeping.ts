import { Constraint } from '../../shared/geometry/constraints/constraints';
import {
  AttributeChange,
  CompositeCommand,
  DocCommand,
  RemoveNode,
  SetAttributes,
  SetText,
} from '../document/commands';
import { IconDocument } from '../document/icon-document';
import {
  CID_ATTR,
  constraintsJson,
  freshCid,
  MAX_CONSTRAINTS,
  metadataOf,
  readConstraints,
} from './constraint-storage';

/** Elements that can carry constraints at all (prompt 059: no paths, no arcs). */
const KINDS = new Set(['line', 'rect', 'circle', 'polygon', 'polyline']);

/** What the housekeeping of one change did (prompt 065). */
export interface Housekeeping {
  command: DocCommand;
  /** Constraints dropped because an element they name is gone or no longer a shape for them. */
  removed: number;
  /** Constraints copied with duplicated elements. */
  copied: number;
}

const cidOf = (ref: string) => ref.slice(0, ref.indexOf('.'));
const partOf = (ref: string) => ref.slice(ref.indexOf('.'));

/** Every element of an asset with a `data-cid`, by cid, in document order. */
function cidElements(root: Element): Map<string, Element[]> {
  const map = new Map<string, Element[]>();
  for (const el of Array.from(root.querySelectorAll(`[${CID_ATTR}]`))) {
    const cid = el.getAttribute(CID_ATTR)!;
    map.set(cid, [...(map.get(cid) ?? []), el]);
  }
  return map;
}

function nextId(list: readonly Constraint[]): () => string {
  const ids = new Set(list.map((c) => c.id));
  let k = list.length + 1;
  return () => {
    while (ids.has(`k${k}`)) k++;
    ids.add(`k${k}`);
    return `k${k}`;
  };
}

/**
 * Keeps the stored constraints of every asset in line with its elements (prompt 065), as one
 * follow-up command of the change just done:
 * - a constraint whose element was deleted, or replaced by one that cannot carry it (a rect
 *   turned into a path by Corners, Trim, Fillet, Offset …), is removed;
 * - copies (Duplicate, Paste, patterns) that repeat a `data-cid` get fresh ones – the first
 *   element in document order keeps the cid – and the constraints among the copied elements are
 *   copied with them (the k-th copy of each element forms the k-th set; `fix` stays with the
 *   original, a copy is somewhere else).
 * `null` when everything is in order. Pure – reads attributes only.
 */
export function constraintHousekeeping(doc: IconDocument): Housekeeping | null {
  const cmds: DocCommand[] = [];
  let removed = 0;
  let copied = 0;
  for (const asset of doc.assets.values()) {
    const root = asset.svg?.root;
    const meta = root ? metadataOf(root) : null;
    if (!root || !meta) continue;
    const list = readConstraints(root);
    const els = cidElements(root);
    const alive = (cid: string) => (els.get(cid) ?? []).some((e) => KINDS.has(e.localName));
    const kept = list.filter((c) => c.refs.every((r) => alive(cidOf(r))));
    removed += list.length - kept.length;

    // repeated cids: the copies get fresh ones, batch k = the k-th copy of every element
    const taken = new Set(els.keys());
    const changes: AttributeChange[] = [];
    const batches: Map<string, string>[] = [];
    for (const [cid, all] of els) {
      all.slice(1).forEach((copy, i) => {
        const ref = doc.refOf(copy);
        if (!ref) return;
        const fresh = freshCid(taken);
        taken.add(fresh);
        changes.push({ ref, name: CID_ATTR, value: fresh });
        (batches[i] ??= new Map()).set(cid, fresh);
      });
    }
    const id = nextId(kept);
    const copies: Constraint[] = [];
    for (const batch of batches) {
      for (const c of kept) {
        if (c.type === 'fix' || !c.refs.every((r) => batch.has(cidOf(r)))) continue;
        if (kept.length + copies.length >= MAX_CONSTRAINTS) break;
        copies.push({
          ...c,
          id: id(),
          refs: c.refs.map((r) => batch.get(cidOf(r))! + partOf(r)),
        });
      }
    }
    copied += copies.length;
    if (changes.length) cmds.push(new SetAttributes(changes, 'changeAttribute'));
    if (kept.length === list.length && !copies.length) continue;
    const next = [...kept, ...copies];
    const metaRef = doc.refOf(meta);
    if (!metaRef) continue;
    cmds.push(
      next.length
        ? new SetText([{ ref: metaRef, text: constraintsJson(next) }])
        : new RemoveNode(metaRef),
    );
  }
  if (!cmds.length) return null;
  return {
    command: cmds.length === 1 ? cmds[0] : new CompositeCommand('changeAttribute', cmds),
    removed,
    copied,
  };
}
