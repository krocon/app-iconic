/**
 * Keeping the selection over "Edit SVG…" of a whole asset (design 011 E6): the new markup gets
 * fresh ids, so a selected node is found again by its index path (child positions from the asset
 * root) – if an element with the same local name stands there. Pure.
 */

/** Child positions from `root` down to `el`; `null` if `el` is not inside `root`. */
export function indexPath(root: Element, el: Element): number[] | null {
  const path: number[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur) as number);
    cur = parent;
  }
  return cur === root ? path : null;
}

export function atPath(root: Element, path: readonly number[]): Element | null {
  let cur: Element | null = root;
  for (const i of path) cur = cur?.children[i] ?? null;
  return cur;
}

/** The elements of `newRoot` that stand where the `selected` ones stood in `oldRoot`. */
export function mapSelection(
  oldRoot: Element,
  newRoot: Element,
  selected: readonly Element[],
): Element[] {
  const out: Element[] = [];
  for (const el of selected) {
    const path = indexPath(oldRoot, el);
    const found = path ? atPath(newRoot, path) : null;
    if (found && found.localName === el.localName && !out.includes(found)) out.push(found);
  }
  return out;
}
