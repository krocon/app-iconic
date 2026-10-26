import { IconDocument, NodeRef } from '../icon-document';
import { elementsOf } from './node-ids';

/**
 * `id`s and references to them inside SVG markup (design 006 E7/E10/E12): `url(#x)` in any
 * attribute (also `style`) and `href` / `xlink:href` = `#x`. Read with the DOM, no parser of our own.
 */

const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

function isHref(a: Attr): boolean {
  return a.localName === 'href';
}

/** Every `id` of the subtree. */
export function collectIds(root: Element): Set<string> {
  const ids = new Set<string>();
  for (const el of elementsOf(root)) {
    const id = el.getAttribute('id');
    if (id) ids.add(id);
  }
  return ids;
}

/** Every id the elements refer to. */
function refsOf(els: Iterable<Element>): Set<string> {
  const out = new Set<string>();
  for (const el of els) {
    for (const a of Array.from(el.attributes)) {
      if (isHref(a) && a.value.startsWith('#')) out.add(a.value.slice(1));
      for (const m of a.value.matchAll(URL_REF)) out.add(m[2]);
    }
  }
  return out;
}

/** Ids the subtree of `el` refers to. */
export function referencedIds(el: Element): Set<string> {
  return refsOf(elementsOf(el));
}

/** Replaces references to the ids of `map` in the subtree (in place). */
export function rewriteReferences(root: Element, map: ReadonlyMap<string, string>): void {
  if (map.size === 0) return;
  for (const el of elementsOf(root)) {
    for (const a of Array.from(el.attributes)) {
      let v = a.value;
      if (isHref(a) && v.startsWith('#') && map.has(v.slice(1))) v = `#${map.get(v.slice(1))}`;
      v = v.replace(URL_REF, (all, q: string, id: string) =>
        map.has(id) ? `url(${q}#${map.get(id)}${q})` : all,
      );
      if (v !== a.value) a.value = v;
    }
  }
}

/**
 * Makes the `id`s of `elements` unique against `taken` (and among each other): `x` → `x-2`, `x-3` …;
 * references inside the elements follow. `taken` gets the new ids. Returns old → new.
 */
export function renameCollidingIds(
  elements: readonly Element[],
  taken: Set<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const root of elements) {
    for (const el of elementsOf(root)) {
      const id = el.getAttribute('id');
      if (!id) continue;
      if (!taken.has(id)) {
        taken.add(id);
        continue;
      }
      let n = 2;
      while (taken.has(`${id}-${n}`)) n++;
      const fresh = `${id}-${n}`;
      taken.add(fresh);
      map.set(id, fresh);
      el.setAttribute('id', fresh);
    }
  }
  for (const root of elements) rewriteReferences(root, map);
  return map;
}

/**
 * References that stop resolving when the nodes `refs` move into the asset `target` (design 006
 * E7): ids the moved subtrees point to that the target does not have, and ids inside them that
 * the rest of their old asset still points to. Sorted, without duplicates.
 */
export function brokenReferences(
  doc: IconDocument,
  refs: readonly NodeRef[],
  target: string,
): string[] {
  const targetRoot = doc.assets.get(target)?.svg?.root;
  const there = targetRoot ? collectIds(targetRoot) : new Set<string>();
  const broken = new Set<string>();
  for (const r of refs) {
    if (r.asset === target) continue;
    const el = doc.node(r);
    const root = doc.assets.get(r.asset)?.svg?.root;
    if (!el || !root) continue;
    const inside = collectIds(el);
    for (const id of referencedIds(el)) if (!inside.has(id) && !there.has(id)) broken.add(id);
    const rest = elementsOf(root).filter((e) => !el.contains(e));
    for (const id of refsOf(rest)) if (inside.has(id)) broken.add(id);
  }
  return [...broken].sort();
}
