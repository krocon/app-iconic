import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { isDefinitionElement, layerRoot, topLevelElements } from '../document/model/reorder-rules';
import { Selection } from '../hierarchy/follow-up';
import { layerInsertParent } from '../document/model/clip-model';

/**
 * Where "Add …" puts a new element (design 008 E2; legacy `resolveTargetAssetAndContainer`,
 * Marc Kronberg, plus the paste rules of 006). Pure: reads the document, changes nothing.
 */
export type InsertTarget =
  | { kind: 'node'; parent: NodeRef; index: number }
  /** No layer with an editable SVG: the action first adds an icon group (E2 rule 5). */
  | { kind: 'newGroup' };

/** Containers a shape may go into (not `defs`, `clipPath` … – those paint nothing). */
const PAINT_CONTAINERS = new Set(['g', 'a', 'switch', 'svg']);

function isPaintContainer(el: Element): boolean {
  return PAINT_CONTAINERS.has(el.localName) && !isDefinitionElement(el);
}

/** The outermost definition element around `el` (`el` itself if it paints). */
function outsideDefinitions(el: Element): Element {
  let out = el;
  for (let e: Element | null = el; e?.parentElement; e = e.parentElement) {
    if (isDefinitionElement(e)) out = e;
  }
  return isDefinitionElement(out) && out.parentElement ? out : el;
}

function into(doc: IconDocument, parent: Element): InsertTarget | null {
  const ref = doc.refOf(parent);
  return ref ? { kind: 'node', parent: ref, index: parent.children.length } : null;
}

function after(doc: IconDocument, el: Element): InsertTarget | null {
  const parent = el.parentElement;
  if (!parent) return into(doc, el);
  const ref = doc.refOf(parent);
  const index = Array.prototype.indexOf.call(parent.children, el) as number;
  return ref ? { kind: 'node', parent: ref, index: index + 1 } : null;
}

/** The first layer (top of the list, design 004 E3) whose asset is an editable SVG. */
export function firstEditableLayer(doc: IconDocument): { group: number; layer: number } | null {
  const gs = groups(doc.iconJson);
  for (let g = 0; g < gs.length; g++) {
    const ls = layers(gs[g]);
    for (let l = 0; l < ls.length; l++) if (layerRoot(doc, g, l)) return { group: g, layer: l };
  }
  return null;
}

/** The first layer that shows `asset` (an asset may be shown by several). */
export function layerOfAsset(
  doc: IconDocument,
  asset: string,
): { group: number; layer: number } | null {
  const gs = groups(doc.iconJson);
  for (let g = 0; g < gs.length; g++) {
    const ls = layers(gs[g]);
    for (let l = 0; l < ls.length; l++) {
      const name = ls[l]['image-name'];
      if (typeof name === 'string' && doc.asset(name)?.name === asset) {
        return { group: g, layer: l };
      }
    }
  }
  return null;
}

/**
 * The group of the "current layer" (design 008 E4): of the selected nodes, the selected
 * layer/group, else the first editable layer; `null` without groups.
 */
export function currentGroupIndex(doc: IconDocument, sel: Selection): number | null {
  const node = sel.nodes.find((r) => doc.node(r));
  const fromNode = node ? layerOfAsset(doc, node.asset) : null;
  if (fromNode) return fromNode.group;
  const item = sel.items.find((i) => i.kind !== 'root');
  if (item && 'group' in item && item.group < groups(doc.iconJson).length) return item.group;
  const first = firstEditableLayer(doc);
  if (first) return first.group;
  return groups(doc.iconJson).length ? 0 : null;
}

/**
 * Where a new element goes (design 008 E2): (1) the last selected node – into it if it is a
 * container, else right after it; (2) a selected layer (a group: its first layer) – the end of its
 * asset; (3) the canvas group context; (4) the end of the first editable layer's asset; (5) none.
 */
export function insertTarget(
  doc: IconDocument,
  sel: Selection,
  context: NodeRef | null = null,
): InsertTarget {
  const last = topLevelElements(doc, sel.nodes).at(-1);
  if (last) {
    const el = outsideDefinitions(last);
    const t = el === last && isPaintContainer(el) ? into(doc, el) : after(doc, el);
    if (t) return t;
  }
  for (const item of sel.items) {
    if (item.kind === 'root') continue;
    const root = layerRoot(doc, item.group, item.kind === 'layer' ? item.layer : 0);
    const t = root ? into(doc, layerInsertParent(root)) : null;
    if (t) return t;
  }
  const ctx = context ? doc.node(context) : null;
  if (ctx && isPaintContainer(ctx)) {
    const t = into(doc, ctx);
    if (t) return t;
  }
  const first = firstEditableLayer(doc);
  const root = first ? layerRoot(doc, first.group, first.layer) : null;
  return (root && into(doc, layerInsertParent(root))) || { kind: 'newGroup' };
}
