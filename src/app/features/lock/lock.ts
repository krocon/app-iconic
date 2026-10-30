import { AttributeChange, DocCommand, SetAttributes } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { IconItem } from '../document/model/selection';

/**
 * Lock (prompt 055, like Illustrator): a locked element – or one inside a locked group – cannot be
 * hit or caught by the marquee, but still snaps. `data-locked` stays in the file (no effect on how
 * the icon looks). Pure.
 */
export const LOCK_ATTR = 'data-locked';

/** `el` or an ancestor up to `root` is locked. */
export function isLocked(el: Element, root?: Element | null): boolean {
  for (let e: Element | null = el; e && e !== root?.parentElement; e = e.parentElement) {
    if (e.hasAttribute(LOCK_ATTR)) return true;
  }
  return false;
}

/**
 * The nodes a tool may change (prompt 064): locked ones may still be a boundary (cut against,
 * snapped to), never a target. One helper for every tool that changes geometry.
 */
export function editableRefs(doc: IconDocument, refs: readonly NodeRef[]): NodeRef[] {
  return refs.filter((r) => {
    const el = doc.node(r);
    return !!el && !isLocked(el);
  });
}

/** Toggle of the nodes: all locked → unlocked, else the others are locked. */
export function lockCommand(doc: IconDocument, refs: readonly NodeRef[]): DocCommand | null {
  const els = refs.flatMap((ref) => {
    const el = doc.node(ref);
    // the asset root too: it stands for a layer (prompt 072 E5)
    return el ? [{ ref, el }] : [];
  });
  if (!els.length) return null;
  const unlock = els.every((x) => x.el.hasAttribute(LOCK_ATTR));
  const changes: AttributeChange[] = els
    .filter((x) => unlock || !x.el.hasAttribute(LOCK_ATTR))
    .map((x) => ({ ref: x.ref, name: LOCK_ATTR, value: unlock ? null : 'true' }));
  return changes.length ? new SetAttributes(changes, unlock ? 'unlock' : 'lock') : null;
}

/** Unlock everything in every asset. */
export function unlockAllCommand(doc: IconDocument): DocCommand | null {
  const changes: AttributeChange[] = [];
  for (const a of doc.assets.values()) {
    for (const el of a.svg?.root.querySelectorAll(`[${LOCK_ATTR}]`) ?? []) {
      const ref = doc.refOf(el);
      if (ref) changes.push({ ref, name: LOCK_ATTR, value: null });
    }
  }
  return changes.length ? new SetAttributes(changes, 'unlock') : null;
}

/**
 * The nodes that lock groups and layers (prompt 072 E5): the root `<svg>` of each layer's asset –
 * `icon.json` gets no new key, `data-locked` stays in the SVG like every lock (055). A group stands
 * for all its layers.
 */
export function itemLockRefs(doc: IconDocument, items: readonly IconItem[]): NodeRef[] {
  const out: NodeRef[] = [];
  const add = (g: number, l: number) => {
    const name = layers(groups(doc.iconJson)[g])[l]?.['image-name'];
    const root = typeof name === 'string' ? doc.asset(name)?.svg?.root : null;
    const ref = root ? doc.refOf(root) : null;
    if (ref && !out.some((r) => r.asset === ref.asset && r.id === ref.id)) out.push(ref);
  };
  for (const it of items) {
    if (it.kind === 'layer') add(it.group, it.layer);
    else if (it.kind === 'group') {
      const grp = groups(doc.iconJson)[it.group];
      if (grp) layers(grp).forEach((_, l) => add(it.group, l));
    }
  }
  return out;
}
