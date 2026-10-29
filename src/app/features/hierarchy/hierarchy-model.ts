import { fillPreview } from '../canvas/fill-preview';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import {
  isContainerElement,
  isDefinitionElement,
  isDefinitionTag,
} from '../document/model/reorder-rules';
import { IconItem, sameItem, sameRef, TreeTarget } from '../document/model/selection';
import { ID_ATTR } from '../document/svg/node-ids';
import { clipIdOf, isClipGroup } from '../document/model/clip-model';
import { CLIP_TEXTS as CT } from '../clip/clip-texts';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';
import { groupLabel, layerLabel, nodeLabel } from './node-label';
import { fillSwatch, Swatch, swatchOf } from './swatch';

/**
 * The document as a tree (design 006 E1): root (icon, background fill) → groups → layers → SVG
 * nodes, the non-rendering children of an asset root in a "Definitions" node per layer. Derived
 * from the document only (a `computed` in the tree component). Pure – reads the DOM.
 */
export type TreeKind = 'root' | 'group' | 'layer' | 'defs' | 'node';

export interface TreeNode {
  /** Row id: `root`, `g0`, `g0/l1`, `g0/l1/defs`, `g0/l1/n17`. */
  id: string;
  kind: TreeKind;
  label: string;
  /** Element name of a node (type icon). */
  tag?: string;
  item?: IconItem;
  ref?: NodeRef;
  fill: Swatch | null;
  stroke: Swatch | null;
  /** Hidden itself (`display: none` / `hidden: true`). */
  hidden: boolean;
  /** Locked itself (`data-locked`, prompt 055); elements only. */
  locked?: boolean;
  /** Paints nothing (inside "Definitions"): no canvas actions. */
  definition: boolean;
  /** May take children (drop "into"). */
  container: boolean;
  /** A layer whose image is missing or cannot be edited. */
  warning?: string;
  /** The clip the node itself refers to (design 014 E12). */
  clip?: string;
  children: TreeNode[];
}

/** One visible row of the flat list (APG tree with `aria-level` etc.). */
export interface TreeRow {
  node: TreeNode;
  level: number;
  posinset: number;
  setsize: number;
  /** `null` for rows without children. */
  expanded: boolean | null;
  parent: string | null;
  /** An ancestor is hidden. */
  dimmed: boolean;
}

/** `display: none` on the element (attribute or `style`). */
export function isHiddenElement(el: Element): boolean {
  if (el.getAttribute('display')?.trim() === 'none') return true;
  const style = (el as Partial<ElementCSSInlineStyle>).style;
  return style?.getPropertyValue('display')?.trim() === 'none';
}

function nodeOf(el: Element, asset: string, parentId: string, root: Element): TreeNode {
  const id = el.getAttribute(ID_ATTR) ?? '';
  const rowId = `${parentId}/${id}`;
  const clip = clipIdOf(el);
  const label =
    isClipGroup(el, root) && !el.getAttribute('id')
      ? `${CT.layerClipGroup} · ${el.children.length}`
      : nodeLabel(el);
  return {
    id: rowId,
    kind: 'node',
    label,
    ...(clip ? { clip } : {}),
    tag: el.localName,
    ref: { asset, id },
    fill: swatchOf(el, 'fill', root),
    stroke: swatchOf(el, 'stroke', root),
    hidden: isHiddenElement(el),
    ...(el.hasAttribute('data-locked') ? { locked: true } : {}),
    definition: isDefinitionElement(el),
    container: isContainerElement(el),
    children: Array.from(el.children).map((c) => nodeOf(c, asset, rowId, root)),
  };
}

function layerNode(doc: IconDocument, g: number, l: number): TreeNode {
  const layer = layers(groups(doc.iconJson)[g])[l];
  const id = `g${g}/l${l}`;
  const name = layer['image-name'];
  const asset = typeof name === 'string' ? doc.asset(name) : undefined;
  const root = asset?.svg?.root;
  const children: TreeNode[] = [];
  if (asset && root) {
    const kids = Array.from(root.children);
    const defs = kids.filter(isDefinitionTag);
    if (defs.length) {
      const defsId = `${id}/defs`;
      children.push({
        id: defsId,
        kind: 'defs',
        label: T.definitions,
        fill: null,
        stroke: null,
        hidden: false,
        definition: true,
        container: false,
        children: defs.map((d) => nodeOf(d, asset.name, defsId, root)),
      });
    }
    children.push(
      ...kids.filter((k) => !isDefinitionTag(k)).map((k) => nodeOf(k, asset.name, id, root)),
    );
  }
  return {
    id,
    kind: 'layer',
    label: layerLabel(layer),
    item: { kind: 'layer', group: g, layer: l },
    fill: null,
    stroke: null,
    hidden: layer['hidden'] === true,
    definition: false,
    container: !!root,
    warning: !asset ? T.missing : asset.kind === 'svg' && !root ? T.notEditable : undefined,
    children,
  };
}

export function buildTree(doc: IconDocument): TreeNode {
  return {
    id: 'root',
    kind: 'root',
    label: T.icon,
    item: { kind: 'root' },
    fill: fillSwatch(fillPreview(doc.iconJson, 'light').preview),
    stroke: null,
    hidden: false,
    definition: false,
    container: false,
    children: groups(doc.iconJson).map((grp, g) => ({
      id: `g${g}`,
      kind: 'group',
      label: groupLabel(grp, g),
      item: { kind: 'group', group: g },
      fill: null,
      stroke: null,
      hidden: grp['hidden'] === true,
      definition: false,
      container: true,
      children: layers(grp).map((_, l) => layerNode(doc, g, l)),
    })),
  };
}

/** Open unless toggled: root, groups and layers start open; nodes and "Definitions" closed. */
export function isExpanded(node: TreeNode, toggled: ReadonlySet<string>): boolean {
  const open = node.kind === 'root' || node.kind === 'group' || node.kind === 'layer';
  return toggled.has(node.id) ? !open : open;
}

/** The visible rows (expanded parents only), depth first. */
export function flatten(tree: TreeNode, toggled: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (
    n: TreeNode,
    level: number,
    pos: number,
    size: number,
    parent: string | null,
    dim: boolean,
  ) => {
    const has = n.children.length > 0;
    const open = has && isExpanded(n, toggled);
    rows.push({
      node: n,
      level,
      posinset: pos,
      setsize: size,
      expanded: has ? open : null,
      parent,
      dimmed: dim,
    });
    if (open) {
      n.children.forEach((c, i) =>
        walk(c, level + 1, i + 1, n.children.length, n.id, dim || n.hidden),
      );
    }
  };
  walk(tree, 1, 1, 1, null, false);
  return rows;
}

/** Every node of the tree, depth first. */
export function allNodes(tree: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(tree);
  return out;
}

/** The node is in the selection (`refs` for nodes, `items` for root/groups/layers). */
export function isSelected(
  n: TreeNode,
  refs: readonly NodeRef[],
  items: readonly IconItem[],
): boolean {
  if (n.ref) return refs.some((r) => sameRef(r, n.ref!));
  if (n.item) return items.some((i) => sameItem(i, n.item!));
  return false;
}

/** Row ids of the ancestors of every selected node (to reveal the selection). */
export function ancestorsOfSelection(
  tree: TreeNode,
  refs: readonly NodeRef[],
  items: readonly IconItem[],
): string[] {
  const out = new Set<string>();
  const walk = (n: TreeNode, path: string[]) => {
    if (isSelected(n, refs, items)) path.forEach((p) => out.add(p));
    n.children.forEach((c) => walk(c, [...path, n.id]));
  };
  walk(tree, []);
  return [...out];
}

/** The move target a row stands for (`null`: root, "Definitions"). */
export function targetOf(n: TreeNode): TreeTarget | null {
  if (n.ref) return { kind: 'node', ref: n.ref };
  if (n.item && n.item.kind !== 'root') return n.item;
  return null;
}

/** Index of the tree node by row id. */
export function indexTree(
  tree: TreeNode,
): Map<string, { node: TreeNode; parent: TreeNode | null }> {
  const map = new Map<string, { node: TreeNode; parent: TreeNode | null }>();
  const walk = (n: TreeNode, parent: TreeNode | null) => {
    map.set(n.id, { node: n, parent });
    n.children.forEach((c) => walk(c, n));
  };
  walk(tree, null);
  return map;
}

/** The label of the first selected row (questions: "Delete “rect 10 × 20”?"). */
export function nodeLabelOf(
  tree: TreeNode,
  sel: { nodes: readonly NodeRef[]; items: readonly IconItem[] },
): string {
  return allNodes(tree).find((n) => isSelected(n, sel.nodes, sel.items))?.label ?? '';
}
