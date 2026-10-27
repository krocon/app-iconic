import { clipIdOf } from '../document/model/clip-model';
import { elementsOf, stripInternal } from '../document/svg/node-ids';
import { rewriteReferences } from '../document/svg/svg-references';

/**
 * Keeping clip references whole when nodes are copied, duplicated or deleted (design 014 E10).
 * Pure – reads the DOM, builds markup.
 */

const isClip = (e: Element) => e.localName === 'clipPath';

/** The `<clipPath>`s of `root` that the subtrees of `els` refer to but that lie outside all of them. */
export function outsideClips(els: readonly Element[], root: Element): Element[] {
  const ids = new Set<string>();
  for (const el of els) {
    for (const e of elementsOf(el)) {
      const id = clipIdOf(e);
      if (id) ids.add(id);
    }
  }
  const all = elementsOf(root).filter(isClip);
  return all.filter((c) => {
    const id = c.getAttribute('id');
    return !!id && ids.has(id) && !els.some((el) => el.contains(c));
  });
}

/** `<defs>` with copies of the clips the copied nodes need (Copy, Copy XML), `null` if none. */
export function clipDefsMarkup(
  els: readonly Element[],
  root: Element,
  serialize: (el: Element) => string,
): string | null {
  const clips = outsideClips(els, root);
  if (!clips.length) return null;
  return `<defs>${clips.map(serialize).join('')}</defs>`;
}

/** The next free id `base-2`, `base-3` … (added to `taken`). */
function freshId(base: string, taken: Set<string>): string {
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * Duplicate (design 014 E10): every clip outside `copy`'s original that it refers to gets a copy
 * with a new id; `copy` (a detached clone) is rewritten to point to the copies. Returns the
 * markup of the clip copies (for `insertDefinition`).
 */
export function duplicateClips(
  original: Element,
  copy: Element,
  root: Element,
  taken: Set<string>,
): string[] {
  const map = new Map<string, string>();
  const out: string[] = [];
  for (const clip of outsideClips([original], root)) {
    const id = clip.getAttribute('id')!;
    const fresh = freshId(id, taken);
    map.set(id, fresh);
    const c = clip.cloneNode(true) as Element;
    stripInternal(c);
    c.setAttribute('id', fresh);
    // ids inside the clip's shapes stay unique too
    for (const e of elementsOf(c).slice(1)) {
      const inner = e.getAttribute('id');
      if (inner) e.setAttribute('id', freshId(inner, taken));
    }
    out.push(new XMLSerializer().serializeToString(c));
  }
  rewriteReferences(copy, map);
  return out;
}

/**
 * The clips among / inside the elements to delete that something else still uses (delete asks
 * first and removes the references, design 014 E10).
 */
export function usedClipsAmong(els: readonly Element[], root: Element): Element[] {
  return els
    .flatMap((el) => elementsOf(el).filter(isClip))
    .filter((clip) => {
      const id = clip.getAttribute('id');
      if (!id) return false;
      return elementsOf(root).some(
        (e) => clipIdOf(e) === id && !clip.contains(e) && !els.some((d) => d.contains(e)),
      );
    });
}
