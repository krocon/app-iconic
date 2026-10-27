import {
  CompositeCommand,
  DocCommand,
  GroupNodes,
  MoveGroup,
  MoveLayer,
  MoveNode,
  ReorderNode,
  Ungroup,
  canUngroup,
} from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import {
  checkReorder,
  isContainerElement,
  isDefinitionElement,
  isDefinitionTag,
} from '../document/model/reorder-rules';
import { DropPosition, IconItem, TreeTarget } from '../document/model/selection';
import { deletableNodes, Planned } from './edit-operations';
import { Selection } from './follow-up';

/**
 * Arrange of the selection (design 006 E2, E6, E11): Bring to Front / Send to Back, Move Up / Down
 * / Into / Out (keyboard alternative to drag & drop), Group <g>, Ungroup. Pure command builders.
 */

/**
 * Nodes for canvas actions: no definitions, no asset roots (design 006 E1) – except the shapes of
 * `scope`, the clip path being edited (design 014 E7).
 */
export function paintedNodes(
  doc: IconDocument,
  refs: readonly NodeRef[],
  scope: Element | null = null,
): Element[] {
  return deletableNodes(doc, refs).filter(
    (e) => !isDefinitionElement(e) || (!!scope && scope !== e && scope.contains(e)),
  );
}

function itemsOf<K extends 'group' | 'layer'>(items: readonly IconItem[], kind: K) {
  return items.filter((i): i is Extract<IconItem, { kind: K }> => i.kind === kind);
}

/** Moves for "to index 0" (front of groups/layers) or "to the end" (front of SVG nodes). */
function itemMoves(doc: IconDocument, items: readonly IconItem[], toStart: boolean): DocCommand[] {
  const cmds: DocCommand[] = [];
  const gs = itemsOf(items, 'group')
    .map((g) => g.group)
    .sort((a, b) => a - b);
  const n = groups(doc.iconJson).length;
  if (gs.length) {
    const order = toStart ? gs : [...gs].reverse();
    order.forEach((i, k) => {
      const to = toStart ? k : n - 1 - k;
      if (i !== to) cmds.push(new MoveGroup(i, to));
    });
    return cmds;
  }
  const ls = itemsOf(items, 'layer');
  for (const g of [...new Set(ls.map((l) => l.group))]) {
    const idx = ls
      .filter((l) => l.group === g)
      .map((l) => l.layer)
      .sort((a, b) => a - b);
    const count = layers(groups(doc.iconJson)[g]).length;
    const order = toStart ? idx : [...idx].reverse();
    order.forEach((i, k) => {
      const to = toStart ? k : count - 1 - k;
      if (i !== to) cmds.push(new MoveLayer({ group: g, layer: i }, { group: g, layer: to }));
    });
  }
  return cmds;
}

/** Bring to Front: SVG nodes to the end of their parent, groups/layers to index 0. */
export function frontCommand(doc: IconDocument, sel: Selection): DocCommand | null {
  return stackCommand(doc, sel, 'front');
}

/** Send to Back: SVG nodes to the start of their parent, groups/layers to the end. */
export function backCommand(doc: IconDocument, sel: Selection): DocCommand | null {
  return stackCommand(doc, sel, 'back');
}

function stackCommand(
  doc: IconDocument,
  sel: Selection,
  where: 'front' | 'back',
): DocCommand | null {
  const label = where === 'front' ? 'bringToFront' : 'sendToBack';
  if (!sel.nodes.length) {
    const cmds = itemMoves(doc, sel.items, where === 'front');
    return cmds.length ? new CompositeCommand(label, cmds) : null;
  }
  const els = paintedNodes(doc, sel.nodes);
  const order = where === 'front' ? els : [...els].reverse();
  const cmds: DocCommand[] = [];
  // simulate per parent: which children are where after the moves before
  const moved = new Map<Element, Element[]>();
  for (const el of order) {
    const parent = el.parentElement!;
    const kids = moved.get(parent) ?? Array.from(parent.children);
    const rest = kids.filter((k) => k !== el);
    const index = where === 'front' ? rest.length : 0;
    const next = where === 'front' ? [...rest, el] : [el, ...rest];
    if (next.some((k, i) => k !== kids[i])) {
      cmds.push(new MoveNode(doc.refOf(el)!, doc.refOf(parent)!, index));
    }
    moved.set(parent, next);
  }
  const changed = [...moved].some(([p, kids]) => kids.some((k, i) => k !== p.children[i]));
  return changed && cmds.length ? new CompositeCommand(label, cmds) : null;
}

export type MoveDirection = 'up' | 'down' | 'into' | 'out';

/** Siblings as the tree shows them (definitions of an asset root sit in their own folder). */
function treeSiblings(el: Element): Element[] {
  const parent = el.parentElement!;
  const all = Array.from(parent.children);
  if (parent.parentElement) return all;
  return all.filter((k) => isDefinitionTag(k) === isDefinitionTag(el));
}

function nodeMove(
  doc: IconDocument,
  refs: readonly NodeRef[],
  dir: MoveDirection,
): ReorderNode | null {
  const els = deletableNodes(doc, refs);
  if (!els.length || els.some((e) => e.parentElement !== els[0].parentElement)) return null;
  const sibs = treeSiblings(els[0]).filter((k) => !els.includes(k));
  const all = treeSiblings(els[0]);
  const first = all.indexOf(els[0]);
  const last = all.indexOf(els[els.length - 1]);
  const before = all
    .slice(0, first)
    .filter((k) => sibs.includes(k))
    .at(-1);
  const after = all.slice(last + 1).find((k) => sibs.includes(k));
  const target = (el: Element | undefined, pos: DropPosition) =>
    el ? { t: { kind: 'node', ref: doc.refOf(el)! } as TreeTarget, pos } : null;
  let plan: { t: TreeTarget; pos: DropPosition } | null;
  if (dir === 'up') plan = target(before, 'before');
  else if (dir === 'down') plan = target(after, 'after');
  else if (dir === 'into')
    plan = before && isContainerElement(before) ? target(before, 'into') : null;
  else {
    const parent = els[0].parentElement!;
    plan = parent.parentElement ? target(parent, 'after') : null;
  }
  return plan
    ? reorder(
        doc,
        refs.map((ref) => ({ kind: 'node', ref })),
        plan.t,
        plan.pos,
      )
    : null;
}

function reorder(
  doc: IconDocument,
  sources: TreeTarget[],
  target: TreeTarget,
  pos: DropPosition,
): ReorderNode | null {
  return checkReorder(doc, sources, target, pos) ? null : new ReorderNode(sources, target, pos);
}

function itemMove(
  doc: IconDocument,
  items: readonly IconItem[],
  dir: MoveDirection,
): ReorderNode | null {
  const gs = itemsOf(items, 'group').sort((a, b) => a.group - b.group);
  const ls = itemsOf(items, 'layer').sort((a, b) => a.layer - b.layer);
  if (gs.length) {
    const n = groups(doc.iconJson).length;
    const idx = gs.map((g) => g.group);
    if (dir === 'up') {
      const t = Math.max(...[-1, ...[...Array(idx[0]).keys()].filter((i) => !idx.includes(i))]);
      return t < 0 ? null : reorder(doc, gs, { kind: 'group', group: t }, 'before');
    }
    if (dir === 'down') {
      const t = [...Array(n).keys()].find((i) => i > idx[idx.length - 1] && !idx.includes(i));
      return t === undefined ? null : reorder(doc, gs, { kind: 'group', group: t }, 'after');
    }
    return null;
  }
  if (!ls.length || ls.some((l) => l.group !== ls[0].group)) return null;
  const g = ls[0].group;
  const idx = ls.map((l) => l.layer);
  const count = layers(groups(doc.iconJson)[g]).length;
  if (dir === 'up') {
    const t = [...Array(idx[0]).keys()].filter((i) => !idx.includes(i)).at(-1);
    return t === undefined
      ? null
      : reorder(doc, ls, { kind: 'layer', group: g, layer: t }, 'before');
  }
  if (dir === 'down') {
    const t = [...Array(count).keys()].find((i) => i > idx[idx.length - 1] && !idx.includes(i));
    return t === undefined
      ? null
      : reorder(doc, ls, { kind: 'layer', group: g, layer: t }, 'after');
  }
  if (dir === 'into' && g > 0) return reorder(doc, ls, { kind: 'group', group: g - 1 }, 'into');
  return null;
}

/** Move Up / Down / Into Group / Out of Group (design 006 E6). */
export function moveCommand(
  doc: IconDocument,
  sel: Selection,
  dir: MoveDirection,
): ReorderNode | null {
  return sel.nodes.length ? nodeMove(doc, sel.nodes, dir) : itemMove(doc, sel.items, dir);
}

/** Group <g> (⌘G): painted nodes of one asset. */
export function groupCommand(doc: IconDocument, sel: Selection): Planned | null {
  const els = paintedNodes(doc, sel.nodes);
  const refs = els.map((e) => doc.refOf(e)!);
  if (!refs.length || refs.some((r) => r.asset !== refs[0].asset)) return null;
  const cmd = new GroupNodes(refs);
  return { command: cmd, selection: () => ({ nodes: cmd.ref ? [cmd.ref] : [], items: [] }) };
}

/** Ungroup (⇧⌘G): one plain `<g>`. */
export function ungroupCommand(doc: IconDocument, sel: Selection): Planned | null {
  if (sel.nodes.length !== 1 || !canUngroup(doc.node(sel.nodes[0]))) return null;
  const cmd = new Ungroup(sel.nodes[0]);
  return { command: cmd, selection: () => ({ nodes: cmd.childRefs(), items: [] }) };
}
