import { McpError } from '../../core/mcp/mcp.models';
import { nodeBoundsInDocument, Rect } from '../../shared/geometry/dom-geometry';
import { DocumentStore } from '../document/document.store';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { serializeAsset } from '../document/svg/node-ids';
import { buildTree, TreeNode } from '../hierarchy/hierarchy-model';

/**
 * What the AI reads (design 018 E7/E15): plain JSON from the document, bounded. Pure apart from
 * the DOM measuring of `nodeInfo` (bounding box over the browser's matrices, 004 E11).
 */

/** Longest attribute value or text in `get_node`. */
export const MAX_VALUE_CHARS = 2000;
/** Children listed by `get_node`. */
export const MAX_CHILDREN = 100;

export function mcpError(code: string, message: string): McpError {
  return { code, message };
}

export function isMcpError(e: unknown): e is McpError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as McpError).code === 'string' &&
    typeof (e as McpError).message === 'string'
  );
}

const cut = (s: string, max = MAX_VALUE_CHARS) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** One window's document in short (`describe`, `list_documents`). */
export interface DocSummary {
  name: string;
  path: string | null;
  format: string;
  dirty: boolean;
  pristine: boolean;
  revision: number;
  undo: string | null;
}

export function summary(store: DocumentStore, untitled: string): DocSummary {
  const doc = store.document();
  return {
    name: doc.name ?? untitled,
    path: doc.path,
    format: doc.format,
    dirty: store.dirty(),
    pristine: store.pristine(),
    revision: store.revision(),
    undo: store.undoTitle,
  };
}

/** `get_document`: summary, selection, assets, groups/layers and – optionally – `icon.json`. */
export function documentInfo(
  store: DocumentStore,
  untitled: string,
  withIconJson: boolean,
): Record<string, unknown> {
  const doc = store.document();
  return {
    ...summary(store, untitled),
    selection: store.selection(),
    items: store.items(),
    assets: [...doc.assets.values()].map((a) => ({
      name: a.name,
      kind: a.kind,
      editable: !!a.svg,
    })),
    groups: groups(doc.iconJson).map((g, i) => ({
      index: i,
      name: typeof g['name'] === 'string' ? g['name'] : null,
      layers: layers(g).map((l, j) => ({
        index: j,
        name: typeof l['name'] === 'string' ? l['name'] : null,
        asset: typeof l['image-name'] === 'string' ? l['image-name'] : null,
      })),
    })),
    ...(withIconJson ? { iconJson: doc.iconJson } : {}),
  };
}

/** `get_asset_svg`: the source as saved (or with the internal ids), at most `maxChars`. */
export function assetSvg(
  doc: IconDocument,
  name: string,
  maxChars: number,
  withIds: boolean,
): Record<string, unknown> {
  const a = doc.asset(name);
  if (!a) throw mcpError('invalid_request', `no asset ${name}`);
  const text = a.svg ? serializeAsset(a.svg, withIds) : (a.text ?? '');
  if (!a.svg && a.text === undefined) {
    throw mcpError('invalid_request', `${name} is a ${a.kind} image, not SVG`);
  }
  return {
    asset: name,
    length: text.length,
    truncated: text.length > maxChars,
    text: text.slice(0, maxChars),
  };
}

/** One row of `get_tree`. */
export interface TreeEntry {
  kind: TreeNode['kind'];
  label: string;
  depth: number;
  ref?: NodeRef;
  item?: TreeNode['item'];
  tag?: string;
  fill?: TreeNode['fill'];
  stroke?: TreeNode['stroke'];
  hidden: boolean;
  definition?: boolean;
  clip?: string;
  /** Paint order among the DOM siblings (0 = back); rows list the front-most first (063). */
  z?: number;
}

/** `get_tree`: the hierarchy depth-first (as the panel shows it, all expanded), at most `max`. */
export function treeEntries(
  doc: IconDocument,
  max: number,
): { nodes: TreeEntry[]; total: number; truncated: boolean } {
  const out: TreeEntry[] = [];
  let total = 0;
  const walk = (n: TreeNode, depth: number) => {
    total++;
    if (out.length < max) {
      out.push({
        kind: n.kind,
        label: n.label,
        depth,
        ...(n.ref ? { ref: n.ref } : {}),
        ...(n.item ? { item: n.item } : {}),
        ...(n.tag ? { tag: n.tag } : {}),
        ...(n.fill ? { fill: n.fill } : {}),
        ...(n.stroke ? { stroke: n.stroke } : {}),
        hidden: n.hidden,
        ...(n.definition ? { definition: true } : {}),
        ...(n.clip ? { clip: n.clip } : {}),
        ...(n.z !== undefined ? { z: n.z } : {}),
      });
    }
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(buildTree(doc), 0);
  return { nodes: out, total, truncated: total > out.length };
}

/** A node ref from the AI (`{ asset, id }`, nothing else). */
export function refArg(v: unknown): NodeRef {
  const r = v as Partial<NodeRef> | null;
  if (
    typeof r !== 'object' ||
    r === null ||
    typeof r.asset !== 'string' ||
    typeof r.id !== 'string' ||
    Object.keys(r).length !== 2
  ) {
    throw mcpError('invalid_request', 'a node is {asset, id}');
  }
  return { asset: r.asset, id: r.id };
}

/** The element of `ref`, or `invalid_request`. */
export function nodeOf(doc: IconDocument, ref: NodeRef): Element {
  const el = doc.node(ref);
  if (!el) throw mcpError('invalid_request', `no node ${ref.id} in ${ref.asset}`);
  return el;
}

function round(r: Rect): Rect {
  const f = (v: number) => Math.round(v * 1000) / 1000;
  return { x: f(r.x), y: f(r.y), width: f(r.width), height: f(r.height) };
}

/** `get_node`: tag, attributes, text, children and the bounds in icon units (browser-measured). */
export function nodeInfo(
  doc: IconDocument,
  ref: NodeRef,
  host: SVGSVGElement | null,
): Record<string, unknown> {
  const el = nodeOf(doc, ref);
  const attributes: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (!a.name.startsWith('data-ai-')) attributes[a.name] = cut(a.value);
  }
  const kids = Array.from(el.children);
  const children = kids
    .slice(0, MAX_CHILDREN)
    .map((c) => doc.refOf(c))
    .filter((r): r is NodeRef => r !== null);
  const parent = el.parentElement ? doc.refOf(el.parentElement) : null;
  let bbox: Rect | null = null;
  if (host && el instanceof SVGGraphicsElement && el.isConnected) {
    const r = nodeBoundsInDocument(host, el);
    if (r && [r.x, r.y, r.width, r.height].every(Number.isFinite)) bbox = round(r);
  }
  return {
    ref,
    tag: el.localName,
    attributes,
    ...(kids.length === 0 && el.textContent ? { text: cut(el.textContent) } : {}),
    childCount: kids.length,
    children,
    parent: parent && parent.id !== ref.id ? parent : null,
    bbox,
  };
}

/** Every element id of a ref list exists (the AI's `select`). */
export function existingRefs(doc: IconDocument, list: unknown): NodeRef[] {
  if (!Array.isArray(list)) throw mcpError('invalid_request', 'nodes must be a list');
  return list.map((v) => {
    const r = refArg(v);
    nodeOf(doc, r);
    return r;
  });
}
