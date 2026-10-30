import { TreeNode, TreeRow } from './hierarchy-model';

/**
 * The filter of the tree (prompt 072 E2), pure: a node matches when its label (name, id, the
 * element's hint) or tag contains the query, case-insensitive. The rows show the matches with
 * their ancestors – every one of them open – so the virtualised list stays one flat list.
 */
export interface TreeFilter {
  /** Row ids of the matches, in tree order. */
  matches: string[];
  rows: TreeRow[];
}

/** The query as matched (trimmed, lower case); empty = no filter. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function nodeMatches(n: TreeNode, query: string): boolean {
  if (!query || n.kind === 'root') return false;
  return n.label.toLowerCase().includes(query) || (n.tag ?? '').toLowerCase() === query;
}

export function filterTree(tree: TreeNode, rawQuery: string): TreeFilter {
  const query = normalizeQuery(rawQuery);
  const matches: string[] = [];
  const rows: TreeRow[] = [];
  /** The subtree of `n` holds a match (memoised per call). */
  const holds = new Map<TreeNode, boolean>();
  const has = (n: TreeNode): boolean => {
    let v = holds.get(n);
    if (v === undefined) {
      v = nodeMatches(n, query) || n.children.some(has);
      holds.set(n, v);
    }
    return v;
  };
  const walk = (
    n: TreeNode,
    level: number,
    pos: number,
    size: number,
    parent: string | null,
    dim: boolean,
  ) => {
    const kids = n.children.filter(has);
    if (nodeMatches(n, query)) matches.push(n.id);
    rows.push({
      node: n,
      level,
      posinset: pos,
      setsize: size,
      expanded: kids.length ? true : null,
      parent,
      dimmed: dim,
    });
    kids.forEach((c, i) => walk(c, level + 1, i + 1, kids.length, n.id, dim || n.hidden));
  };
  if (query && has(tree)) walk(tree, 1, 1, 1, null, false);
  return { matches, rows };
}

/** `label` cut around the first match for highlighting; `null` = no match in the label. */
export function highlight(
  label: string,
  rawQuery: string,
): { before: string; match: string; after: string } | null {
  const query = normalizeQuery(rawQuery);
  const at = query ? label.toLowerCase().indexOf(query) : -1;
  if (at < 0) return null;
  return {
    before: label.slice(0, at),
    match: label.slice(at, at + query.length),
    after: label.slice(at + query.length),
  };
}

/** The open state for "Expand All" / "Collapse All" (prompt 072 E3) as `toggled` row ids. */
export function toggledFor(tree: TreeNode, open: boolean): Set<string> {
  const out = new Set<string>();
  const walk = (n: TreeNode) => {
    if (n.children.length && n.kind !== 'root') {
      const openByDefault = n.kind === 'group' || n.kind === 'layer';
      if (openByDefault !== open) out.add(n.id);
    }
    n.children.forEach(walk);
  };
  walk(tree);
  return out;
}
