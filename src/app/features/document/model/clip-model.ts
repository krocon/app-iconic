import { styleValue } from '../svg/style-props';
import { collectIds } from '../svg/svg-references';
import { isDefinitionElement } from './reorder-rules';

/**
 * Clip paths as plain SVG (design 014 E1–E4): `<clipPath>` in the asset's `<defs>`, referenced by
 * `clip-path="url(#id)"` (attribute or `style`). A clip at the LAYER is a "clip group" – a child
 * `<g>` of the asset root that carries nothing but the `clip-path` (and `id` / `data-*`), the shape
 * Figma and Sketch export. Inheritance is SVG's: a node is clipped by its own clip and by every
 * clipping ancestor. Pure – reads the DOM, changes nothing. Cases of `SVGClipPathTests.swift`
 * (Marc Kronberg) in the spec.
 */

/** A clip reference: an id, or another value we keep but do not edit (`circle(50%)` …). */
export type ClipRef = { id: string } | { other: string };

export type ClipMode = 'own' | 'inherit' | 'none';

export interface ClipResolution {
  mode: ClipMode;
  /** The id that applies (own or of the nearest clipping ancestor); `null` for none / other. */
  clip: string | null;
  /** The ancestor the clip comes from (`inherit`). */
  from: Element | null;
  /** That ancestor is a clip group of the layer. */
  layer: boolean;
  /** An own value that is no `url(#id)`. */
  other: string | null;
}

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const URL = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)$/;
const STYLE_DECL = /(?:^|;)\s*clip-path\s*:\s*([^;]+)/i;

/** The `clip-path` of the element itself: `style` first (it wins in the browser), else the attribute. */
export function clipValueOf(el: Element): string | null {
  const fromStyle =
    styleValue(el, 'clip-path') ?? STYLE_DECL.exec(el.getAttribute('style') ?? '')?.[1]?.trim();
  const v = (fromStyle || el.getAttribute('clip-path'))?.trim();
  return v ? v : null;
}

/** The element's own clip reference; `none` (the initial value) counts as no clip (E2). */
export function clipRefOf(el: Element): ClipRef | null {
  const v = clipValueOf(el);
  if (!v || v === 'none') return null;
  const m = URL.exec(v);
  return m ? { id: m[2] } : { other: v };
}

/** The id the element itself refers to. */
export function clipIdOf(el: Element): string | null {
  const r = clipRefOf(el);
  return r && 'id' in r ? r.id : null;
}

export const clipUrl = (id: string) => `url(#${id})`;

/** Attributes a clip group may carry besides `clip-path` (E3). */
function onlyClip(el: Element): boolean {
  return el
    .getAttributeNames()
    .every((n) => n === 'clip-path' || n === 'id' || n.startsWith('data-'));
}

/** `el` is a clip group of the layer `root` (a direct child `<g>` with only a `clip-path`). */
export function isClipGroup(el: Element, root: Element): boolean {
  return (
    el.parentElement === root &&
    el.localName === 'g' &&
    el.getAttribute('clip-path') !== null &&
    clipIdOf(el) !== null &&
    onlyClip(el)
  );
}

/** The clip groups of the layer that use `id` (all of them without `id`). */
export function clipGroupsOf(root: Element, id?: string): Element[] {
  return Array.from(root.children).filter(
    (k) => isClipGroup(k, root) && (id === undefined || clipIdOf(k) === id),
  );
}

/** The clip of the layer: that of its first clip group (E3). */
export function layerClipOf(root: Element): string | null {
  const g = clipGroupsOf(root)[0];
  return g ? clipIdOf(g) : null;
}

/** Every `<clipPath>` of the asset in document order. */
export function clipPathsOf(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter((e) => e.localName === 'clipPath');
}

/** The `<clipPath id>` of the asset, `null` if there is none. */
export function findClipPath(root: Element, id: string): Element | null {
  return clipPathsOf(root).find((c) => c.getAttribute('id') === id) ?? null;
}

/** The `<clipPath>` that `el` lies in (or is), `null` outside. */
export function enclosingClipPath(el: Element): Element | null {
  for (let e: Element | null = el; e; e = e.parentElement) if (e.localName === 'clipPath') return e;
  return null;
}

/** Elements of the asset that refer to clip `id` (document order). */
export function clipUsers(root: Element, id: string): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))].filter((e) => clipIdOf(e) === id);
}

/**
 * The element a clip's units refer to (E7): the first painting element that uses it. `null` when
 * nothing that paints uses it.
 */
export function clipOwner(root: Element, clip: Element): Element | null {
  const id = clip.getAttribute('id');
  if (!id) return null;
  return clipUsers(root, id).find((e) => !isDefinitionElement(e)) ?? null;
}

/** How `el` is clipped (E4): its own reference, else the nearest clipping ancestor up to the root. */
export function resolveClip(el: Element, root: Element): ClipResolution {
  const own = clipRefOf(el);
  if (own) {
    return 'id' in own
      ? { mode: 'own', clip: own.id, from: null, layer: false, other: null }
      : { mode: 'own', clip: null, from: null, layer: false, other: own.other };
  }
  for (let e = el === root ? null : el.parentElement; e; e = e === root ? null : e.parentElement) {
    const id = clipIdOf(e);
    if (id) return { mode: 'inherit', clip: id, from: e, layer: isClipGroup(e, root), other: null };
  }
  return { mode: 'none', clip: null, from: null, layer: false, other: null };
}

/** Every clip id that cuts `el`, its own first, then outwards to the root (they intersect). */
export function effectiveClips(el: Element, root: Element): string[] {
  const out: string[] = [];
  for (let e: Element | null = el; e; e = e === root ? null : e.parentElement) {
    const id = clipIdOf(e);
    if (id) out.push(id);
  }
  return out;
}

/** The nearest ancestor of `el` (below the root) that is a clip group, `null` if none. */
export function clipGroupAround(el: Element, root: Element): Element | null {
  for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
    if (isClipGroup(e, root)) return e;
  }
  return null;
}

/** A free clip id (`clip`, `clip-2` …) in the asset. */
export function uniqueClipId(root: Element, base = 'clip'): string {
  const taken = collectIds(root);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function nums(s: string | null): number[] {
  return (s ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((v) => Number(v.replace(/px$/, '')));
}

/** The asset's canvas in its own units (E6): `viewBox`, else `width`/`height`, else 1024². */
export function canvasRect(root: Element): ClipRect {
  const vb = nums(root.getAttribute('viewBox'));
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
  }
  const [w] = nums(root.getAttribute('width'));
  const [h] = nums(root.getAttribute('height'));
  if (w > 0 && h > 0) return { x: 0, y: 0, width: w, height: h };
  return { x: 0, y: 0, width: 1024, height: 1024 };
}

/** Elements of the root that paint (not under "Definitions"). */
export function paintingChildren(root: Element): Element[] {
  return Array.from(root.children).filter((k) => !isDefinitionElement(k));
}

/**
 * Where new content of a layer goes (design 014 E3): into its last clip group when the layer ends
 * with one (so it is clipped like the rest), else the asset root.
 */
export function layerInsertParent(root: Element): Element {
  const last = paintingChildren(root).at(-1);
  return last && isClipGroup(last, root) ? last : root;
}
