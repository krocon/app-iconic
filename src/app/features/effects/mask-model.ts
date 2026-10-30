import { urlId } from '../../shared/controls/color-value';
import {
  CompositeCommand,
  DocCommand,
  InsertDefinition,
  InsertNode,
  RemoveAttribute,
  RemoveNode,
  SetAttribute,
} from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { elementsOf, serializeElement, SVG_NS } from '../document/svg/node-ids';

/**
 * Masks like clip paths (prompt 076 E2), pure: "Create Mask" makes the front-most selected element
 * the `<mask>` of the others – they go into a new group with `mask="url(#…)"` (their own space stays
 * the mask's space, transforms included); "Release Mask" puts the mask's content back in front of
 * the masked element and removes the definition when nobody else uses it. `mask-type` switches
 * luminance / alpha.
 */
export type MaskType = 'luminance' | 'alpha';

export function maskOf(el: Element, root: Element): Element | null {
  const id = urlId(el.getAttribute('mask'));
  if (!id) return null;
  return (
    elementsOf(root).find((e) => e.localName === 'mask' && e.getAttribute('id') === id) ?? null
  );
}

function freshId(root: Element, base: string): string {
  const taken = new Set(elementsOf(root).map((e) => e.getAttribute('id')));
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Why "Create Mask" cannot run; `null` = it can. */
export function maskBlocker(doc: IconDocument, refs: readonly NodeRef[]): string | null {
  if (refs.length < 2) return 'count';
  const els = refs.map((r) => doc.node(r));
  if (els.some((e) => !e || !e.parentElement)) return 'node';
  const parent = els[0]!.parentElement;
  if (els.some((e) => e!.parentElement !== parent)) return 'parent';
  return null;
}

/** "Create Mask": one step; the masked group is the result. */
export function createMaskCommand(doc: IconDocument, refs: readonly NodeRef[]): DocCommand | null {
  if (maskBlocker(doc, refs)) return null;
  const els = refs.map((r) => doc.node(r)!);
  const parent = els[0].parentElement!;
  const order = (e: Element) => Array.prototype.indexOf.call(parent.children, e) as number;
  const sorted = [...els].sort((a, b) => order(a) - order(b));
  const top = sorted[sorted.length - 1];
  const masked = sorted.slice(0, -1);
  const asset = refs[0].asset;
  const root = doc.assets.get(asset)!.svg!.root;
  const id = freshId(root, 'mask');
  const mask = `<mask xmlns="${SVG_NS}" id="${id}" mask-type="luminance">${serializeElement(top)}</mask>`;
  const group =
    `<g xmlns="${SVG_NS}" mask="url(#${id})">` + masked.map(serializeElement).join('') + `</g>`;
  const parentRef = doc.refOf(parent)!;
  return new CompositeCommand('createMask', [
    new InsertDefinition(asset, mask, 'createMask'),
    // before the first masked one (indices shift once the old ones are gone)
    new InsertNode(parentRef, group, order(masked[0]), 'createMask'),
    ...els.map((e) => new RemoveNode(doc.refOf(e)!)),
  ]);
}

/** "Release Mask": the content in front of the element, the reference and the unused mask gone. */
export function releaseMaskCommand(doc: IconDocument, ref: NodeRef): DocCommand | null {
  const el = doc.node(ref);
  const root = doc.assets.get(ref.asset)?.svg?.root;
  const mask = el && root ? maskOf(el, root) : null;
  if (!el || !root || !mask || !el.parentElement) return null;
  const id = mask.getAttribute('id')!;
  const users = elementsOf(root).filter((e) => urlId(e.getAttribute('mask')) === id);
  const at = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
  const parentRef = doc.refOf(el.parentElement)!;
  const content = Array.from(mask.children).map(serializeElement);
  const cmds: DocCommand[] = [new RemoveAttribute(ref, 'mask')];
  content.forEach((m, i) => cmds.push(new InsertNode(parentRef, m, at + i, 'releaseMask')));
  if (users.length <= 1) cmds.push(new RemoveNode(doc.refOf(mask)!));
  return new CompositeCommand('releaseMask', cmds);
}

/** `mask-type` of the element's mask. */
export function maskTypeCommand(
  doc: IconDocument,
  ref: NodeRef,
  type: MaskType,
): DocCommand | null {
  const el = doc.node(ref);
  const root = doc.assets.get(ref.asset)?.svg?.root;
  const mask = el && root ? maskOf(el, root) : null;
  const maskRef = mask ? doc.refOf(mask) : null;
  if (!mask || !maskRef || (mask.getAttribute('mask-type') ?? 'luminance') === type) return null;
  return new SetAttribute(maskRef, 'mask-type', type, 'changeMaskType');
}
