import { IconJson } from '../../../core/icon-file/icon-file.models';
import { IconDocument, NodeRef } from '../icon-document';
import { groups, layers, setIn } from './icon-json';
import { DropPosition, sameTarget, TreeTarget } from './selection';

/**
 * The rules of "Reorder Node" (design 006 E6; cases of the old app's `TreeReorderService` and its
 * tests): what may go where in the tree. Pure – reads the document, changes nothing.
 */

/** SVG elements that may take children in the tree. */
const CONTAINERS = new Set([
  'g',
  'a',
  'switch',
  'svg',
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'marker',
]);

/** Elements that paint nothing themselves (they live under "Definitions", design 006 E1). */
const DEFINITIONS = new Set([
  'defs',
  'clipPath',
  'mask',
  'pattern',
  'linearGradient',
  'radialGradient',
  'filter',
  'symbol',
  'marker',
  'style',
  'title',
  'desc',
  'metadata',
]);

export type ReorderError =
  | 'mixedSources'
  | 'cannotMoveRoot'
  | 'unknownSource'
  | 'unknownTarget'
  | 'parentNotContainer'
  | 'cycleDetected'
  | 'topLevelGroupRestriction'
  | 'sameLocation';

export function isContainerElement(el: Element): boolean {
  return CONTAINERS.has(el.localName);
}

/** A non-rendering element itself (not its children). */
export function isDefinitionTag(el: Element): boolean {
  return DEFINITIONS.has(el.localName);
}

/** `el` or one of its ancestors paints nothing (not selectable for canvas actions). */
export function isDefinitionElement(el: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (isDefinitionTag(e)) return true;
  }
  return false;
}

/** The `<svg>` root a layer shows (its `image-name`), `null` without an SVG asset. */
export function layerRoot(doc: IconDocument, group: number, layer: number): Element | null {
  const l = layers(groups(doc.iconJson)[group])[layer];
  const name = l?.['image-name'];
  return typeof name === 'string' ? (doc.asset(name)?.svg?.root ?? null) : null;
}

function exists(doc: IconDocument, t: TreeTarget): boolean {
  if (t.kind === 'node') return doc.node(t.ref) !== null;
  const gs = groups(doc.iconJson);
  if (!Number.isInteger(t.group) || t.group < 0 || t.group >= gs.length) return false;
  return t.kind === 'group' || (t.layer >= 0 && t.layer < layers(gs[t.group]).length);
}

/** The element `target` stands for when nodes are dropped relative to / into it. */
function targetElement(doc: IconDocument, target: TreeTarget): Element | null {
  if (target.kind === 'node') return doc.node(target.ref);
  if (target.kind === 'layer') return layerRoot(doc, target.group, target.layer);
  return null;
}

/** Sources without those inside another source (they move along), in document order. */
export function topLevelElements(doc: IconDocument, refs: readonly NodeRef[]): Element[] {
  const assetOrder = [...doc.assets.keys()];
  const els = refs.map((r) => ({ r, el: doc.node(r) })).filter((x) => x.el !== null) as {
    r: NodeRef;
    el: Element;
  }[];
  const unique = els.filter((x, i) => els.findIndex((y) => y.el === x.el) === i);
  const top = unique.filter((x) => !unique.some((y) => y.el !== x.el && y.el.contains(x.el)));
  return top
    .sort((a, b) => {
      const d = assetOrder.indexOf(a.r.asset) - assetOrder.indexOf(b.r.asset);
      if (d !== 0) return d;
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : pos & Node.DOCUMENT_POSITION_PRECEDING
          ? 1
          : 0;
    })
    .map((x) => x.el);
}

/** Where a node goes: parent element and index among its children without the node itself. */
export function nodeDestination(
  doc: IconDocument,
  el: Element,
  target: TreeTarget,
  position: DropPosition,
): { parent: Element; index: number } | null {
  const t = targetElement(doc, target);
  if (!t) return null;
  const parent = position === 'into' ? t : t.parentElement;
  if (!parent) return null;
  const kids = Array.from(parent.children).filter((k) => k !== el);
  if (position === 'into') return { parent, index: kids.length };
  const at = kids.indexOf(t);
  return { parent, index: position === 'before' ? at : at + 1 };
}

/** Index lists → new index order: `rest` with `moving` put in at `at`. */
function spliceOrder(rest: number[], at: number, moving: number[]): number[] {
  const out = rest.slice();
  out.splice(at, 0, ...moving);
  return out;
}

/** Group / layer moves as one new `icon.json` (design 006 E6) plus where the sources went. */
export function reorderIconJson(
  json: IconJson,
  sources: readonly TreeTarget[],
  target: TreeTarget,
  position: DropPosition,
): { json: IconJson; moved: TreeTarget[] } {
  const gs = groups(json);
  if (sources[0]?.kind === 'group' && target.kind === 'group') {
    const src = [...new Set(sources.map((s) => (s as { group: number }).group))].sort(
      (a, b) => a - b,
    );
    const rest = gs.map((_, i) => i).filter((i) => !src.includes(i));
    const ti = rest.indexOf(target.group);
    const at = position === 'before' ? ti : ti + 1;
    const order = spliceOrder(rest, at, src);
    return {
      json: setIn(
        json,
        ['groups'],
        order.map((i) => gs[i]),
      ),
      moved: src.map((_, k) => ({ kind: 'group', group: at + k })),
    };
  }
  // layers: per group the list of [group, layer] origins
  const lists = gs.map((g, gi) => layers(g).map((_, li) => [gi, li] as const));
  const src = sources
    .map((s) => s as { group: number; layer: number })
    .map((s) => [s.group, s.layer] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((s, i, all) => i === 0 || s[0] !== all[i - 1][0] || s[1] !== all[i - 1][1]);
  const isSrc = (o: readonly [number, number]) => src.some((s) => s[0] === o[0] && s[1] === o[1]);
  const rest = lists.map((l) => l.filter((o) => !isSrc(o)));
  const dg = (target as { group: number }).group;
  let at: number;
  if (target.kind === 'group') {
    at = rest[dg].length;
  } else {
    const t = target as { group: number; layer: number };
    const ti = rest[dg].findIndex((o) => o[0] === t.group && o[1] === t.layer);
    at = position === 'before' ? ti : ti + 1;
  }
  rest[dg].splice(at, 0, ...src);
  let out = json;
  rest.forEach((list, gi) => {
    const same =
      list.length === lists[gi].length && list.every((o, i) => o[0] === gi && o[1] === i);
    if (!same) {
      out = setIn(
        out,
        ['groups', gi, 'layers'],
        list.map(([g, l]) => layers(gs[g])[l]),
      );
    }
  });
  return { json: out, moved: src.map((_, k) => ({ kind: 'layer', group: dg, layer: at + k })) };
}

function checkNodes(
  doc: IconDocument,
  sources: readonly TreeTarget[],
  target: TreeTarget,
  position: DropPosition,
): ReorderError | null {
  if (target.kind === 'group') return 'parentNotContainer';
  if (target.kind === 'layer') {
    if (position !== 'into') return 'parentNotContainer';
    if (!targetElement(doc, target)) return 'unknownTarget';
  } else {
    const t = doc.node(target.ref)!;
    if (position === 'into' && !isContainerElement(t)) return 'parentNotContainer';
    if (position !== 'into' && !t.parentElement) return 'cannotMoveRoot';
  }
  const refs = sources.map((s) => (s as { ref: NodeRef }).ref);
  const els = topLevelElements(doc, refs);
  if (els.some((e) => !e.parentElement)) return 'cannotMoveRoot';
  const t = targetElement(doc, target)!;
  const dest = position === 'into' ? t : t.parentElement!;
  if (els.some((e) => e === t || e === dest || e.contains(dest))) return 'cycleDetected';
  // nothing would change: all sources already sit there in this order
  if (els.every((e) => e.parentElement === dest)) {
    const now = Array.from(dest.children);
    const rest = now.filter((k) => !els.includes(k));
    const at = position === 'into' ? rest.length : rest.indexOf(t) + (position === 'after' ? 1 : 0);
    rest.splice(at, 0, ...els);
    if (rest.every((k, i) => k === now[i])) return 'sameLocation';
  }
  return null;
}

/** `null` = the move is allowed and changes something; else why not (design 006 E6). */
export function checkReorder(
  doc: IconDocument,
  sources: readonly TreeTarget[],
  target: TreeTarget,
  position: DropPosition,
): ReorderError | null {
  if (sources.length === 0) return 'unknownSource';
  const kind = sources[0].kind;
  if (sources.some((s) => s.kind !== kind)) return 'mixedSources';
  if (sources.some((s) => !exists(doc, s))) return 'unknownSource';
  if (!exists(doc, target)) return 'unknownTarget';
  if (sources.some((s) => sameTarget(s, target))) return 'cycleDetected';
  if (kind === 'node') return checkNodes(doc, sources, target, position);
  if (kind === 'group') {
    if (target.kind !== 'group' || position === 'into') return 'topLevelGroupRestriction';
  } else if (
    target.kind === 'group' ? position !== 'into' : target.kind !== 'layer' || position === 'into'
  ) {
    return 'parentNotContainer';
  }
  const { json } = reorderIconJson(doc.iconJson, sources, target, position);
  const before = groups(doc.iconJson);
  const after = groups(json);
  const same = after.every(
    (g, i) =>
      g === before[i] ||
      (layers(g).length === layers(before[i]).length &&
        layers(g).every((l, k) => l === layers(before[i])[k])),
  );
  return same ? 'sameLocation' : null;
}
