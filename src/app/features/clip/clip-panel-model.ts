import { IconDocument, NodeRef } from '../document/icon-document';
import {
  clipIdOf,
  clipOwner,
  clipPathsOf,
  clipUsers,
  enclosingClipPath,
  findClipPath,
  isClipGroup,
  layerClipOf,
  resolveClip,
} from '../document/model/clip-model';
import { ClipUnits, clipUnitsOf } from '../document/model/clip-units';
import { isDefinitionElement, layerRoot } from '../document/model/reorder-rules';
import { IconItem } from '../document/model/selection';
import { CLIP_TEXTS as T } from './clip-texts';

/**
 * What the "Clip Path" section shows (design 014 E13) and what the clip actions work on – from the
 * selection or the AI's arguments. Pure – reads the document.
 */

export type ClipTarget =
  | { kind: 'node'; ref: NodeRef; el: Element; root: Element }
  | { kind: 'layer'; group: number; layer: number; asset: string; root: Element }
  /** A `<clipPath>` or one of its shapes is selected. */
  | { kind: 'clip'; ref: NodeRef; clip: Element; root: Element };

export interface ClipInfo {
  id: string;
  ref: NodeRef;
  units: ClipUnits;
  users: number;
  /** Something that paints uses it (the reference of its units, E7). */
  owned: boolean;
}

export interface ClipOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ClipPanel {
  target: ClipTarget;
  /** `none`, `inherit`, `#<id>` or `other`. */
  value: string | null;
  options: ClipOption[];
  hint: string | null;
  /** The clip Edit / Remove / Units work on. */
  clip: ClipInfo | null;
}

/** The asset name of a layer root. */
function assetOf(doc: IconDocument, root: Element): string | null {
  for (const a of doc.assets.values()) if (a.svg?.root === root) return a.name;
  return null;
}

/** The target of one selected node or layer, `null` for anything else. */
export function clipTargetOf(
  doc: IconDocument,
  nodes: readonly NodeRef[],
  items: readonly IconItem[],
): ClipTarget | null {
  if (nodes.length === 1) {
    const el = doc.node(nodes[0]);
    const root = doc.asset(nodes[0].asset)?.svg?.root;
    if (!el || !root || el === root) return null;
    const clip = enclosingClipPath(el);
    if (clip) {
      const ref = doc.refOf(clip);
      return ref ? { kind: 'clip', ref, clip, root } : null;
    }
    if (isDefinitionElement(el)) return null;
    return { kind: 'node', ref: nodes[0], el, root };
  }
  if (nodes.length === 0 && items.length === 1 && items[0].kind === 'layer') {
    const { group, layer } = items[0];
    return layerTarget(doc, group, layer);
  }
  return null;
}

export function layerTarget(doc: IconDocument, group: number, layer: number): ClipTarget | null {
  const root = layerRoot(doc, group, layer);
  const asset = root ? assetOf(doc, root) : null;
  return root && asset ? { kind: 'layer', group, layer, asset, root } : null;
}

export function clipInfo(doc: IconDocument, root: Element, id: string | null): ClipInfo | null {
  const el = id ? findClipPath(root, id) : null;
  const ref = el ? doc.refOf(el) : null;
  if (!el || !ref || !id) return null;
  const users = clipUsers(root, id).filter((u) => !el.contains(u)).length;
  return { id, ref, units: clipUnitsOf(el), users, owned: clipOwner(root, el) !== null };
}

/** The node may drop its clip completely (E4): no clipping ancestor except its clip group. */
export function canOptOut(el: Element, root: Element): boolean {
  if (isClipGroup(el.parentElement!, root)) return true;
  for (let e = el.parentElement; e && e !== root; e = e.parentElement)
    if (clipIdOf(e)) return false;
  return true;
}

function idOptions(root: Element): ClipOption[] {
  return clipPathsOf(root).flatMap((c) => {
    const id = c.getAttribute('id');
    return id ? [{ value: `#${id}`, label: `#${id}` }] : [];
  });
}

export function clipPanel(doc: IconDocument, target: ClipTarget): ClipPanel {
  const root = target.root;
  if (target.kind === 'clip') {
    const id = target.clip.getAttribute('id');
    return { target, value: null, options: [], hint: null, clip: clipInfo(doc, root, id) };
  }
  if (target.kind === 'layer') {
    const id = layerClipOf(root);
    return {
      target,
      value: id ? `#${id}` : 'none',
      options: [{ value: 'none', label: T.none }, ...idOptions(root)],
      hint: null,
      clip: clipInfo(doc, root, id),
    };
  }
  const r = resolveClip(target.el, root);
  const value = r.other !== null ? 'other' : r.mode === 'own' ? `#${r.clip}` : r.mode;
  const optOut = canOptOut(target.el, root);
  const options: ClipOption[] = [
    { value: 'none', label: T.none, disabled: !optOut },
    { value: 'inherit', label: T.inherit },
    ...idOptions(root),
  ];
  if (r.other !== null) options.push({ value: 'other', label: T.other(r.other), disabled: true });
  let hint: string | null = null;
  if (r.mode === 'inherit' && r.clip) {
    hint = r.layer ? T.inheritedFrom(r.clip) : T.inheritedGroup(r.clip);
  } else if (r.mode === 'own' && r.clip) {
    const outer = resolveClip(target.el.parentElement!, root);
    if (!isClipGroup(target.el.parentElement!, root) && outer.clip)
      hint = T.alsoClipped(outer.clip);
  }
  if (!optOut && r.mode !== 'own') hint = hint ? `${hint} ${T.noneBlocked}` : T.noneBlocked;
  return { target, value, options, hint, clip: clipInfo(doc, root, r.clip) };
}
