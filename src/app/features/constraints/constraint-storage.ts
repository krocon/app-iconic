import {
  Constraint,
  CONSTRAINT_TYPES,
  ConstraintType,
} from '../../shared/geometry/constraints/constraints';
import { Matrix } from '../../shared/geometry/matrix';
import { paramsOf, SketchElement } from '../../shared/geometry/constraints/sketch-model';
import { isRendered } from '../canvas/hit-test';
import { LOCK_ATTR } from '../lock/lock';

/**
 * Where the constraints of an asset live (prompt 059 E3): one `<metadata data-ai-constraints>`
 * with JSON text – kept in the file (lossless), left out of the export. Elements that take part
 * carry `data-cid` (the `id` attribute is the author's and `data-ai-id` is not saved).
 */
export const CONSTRAINTS_ATTR = 'data-ai-constraints';
export const CID_ATTR = 'data-cid';
/** Most constraints per asset (foreign files are hostile). */
export const MAX_CONSTRAINTS = 500;

const REF = /^[A-Za-z0-9_-]{1,40}\.[a-z0-9]{1,12}$/;
const CONSTRAINABLE = new Set(['line', 'rect', 'circle', 'polygon', 'polyline']);

export function metadataOf(root: Element): Element | null {
  return root.querySelector(`metadata[${CONSTRAINTS_ATTR}]`);
}

/** A checked constraint from JSON (the file or the AI), or `null`. */
export function constraintFrom(v: unknown): Constraint | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const type = o['type'] as ConstraintType;
  const refs = o['refs'];
  if (typeof o['id'] !== 'string' || !/^[\w-]{1,40}$/.test(o['id'])) return null;
  if (!CONSTRAINT_TYPES.includes(type)) return null;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 3) return null;
  if (!refs.every((r): r is string => typeof r === 'string' && REF.test(r))) return null;
  const c: Constraint = { id: o['id'], type, refs: [...refs] };
  const value = o['value'];
  if (value !== undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    c.value = value;
  }
  const point = o['point'];
  if (point !== undefined) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    if (!point.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    c.point = [point[0] as number, point[1] as number];
  }
  if (o['internal'] === true) c.internal = true;
  return c;
}

/** The constraints of an asset (invalid entries are skipped, never thrown). */
export function readConstraints(root: Element): Constraint[] {
  const meta = metadataOf(root);
  if (!meta) return [];
  try {
    const data = JSON.parse(meta.textContent ?? '') as unknown;
    const items = (data as { items?: unknown })?.items;
    if (!Array.isArray(items)) return [];
    return items
      .slice(0, MAX_CONSTRAINTS)
      .map(constraintFrom)
      .filter((c): c is Constraint => !!c);
  } catch {
    return [];
  }
}

export function constraintsJson(list: readonly Constraint[]): string {
  return JSON.stringify({ v: 1, items: list });
}

/** An element the solver can drive: line, rect, circle, polygon, polyline with plain numbers. */
export function isConstrainable(el: Element): boolean {
  if (!CONSTRAINABLE.has(el.localName)) return false;
  if (
    el.closest(`defs, clipPath, mask, pattern, symbol, marker, [data-dimension], [${LOCK_ATTR}]`)
  ) {
    return false;
  }
  return !!paramsOf(el.localName, (n) => el.getAttribute(n));
}

/** The constrainable elements of an asset that are painted (for picking). */
export function constrainableIn(root: Element): Element[] {
  return Array.from(root.querySelectorAll([...CONSTRAINABLE].join(','))).filter(
    (el) => isConstrainable(el) && isRendered(el, root),
  );
}

/** The elements of an asset with a `data-cid` (the first one wins if a copy repeats it). */
export function elementsByCid(root: Element): Map<string, Element> {
  const map = new Map<string, Element>();
  for (const el of Array.from(root.querySelectorAll(`[${CID_ATTR}]`))) {
    const cid = el.getAttribute(CID_ATTR)!;
    if (!map.has(cid) && isConstrainable(el)) map.set(cid, el);
  }
  return map;
}

/** A cid not used in `taken`. */
export function freshCid(taken: ReadonlySet<string>): string {
  let k = taken.size + 1;
  while (taken.has(`c${k}`)) k++;
  return `c${k}`;
}

/** The solver's view of the elements (`cids`: element → cid, also the new ones). */
export function sketchElements(
  cids: ReadonlyMap<Element, string>,
  matrixOf: (el: Element) => Matrix | null,
): SketchElement[] {
  const out: SketchElement[] = [];
  for (const [el, cid] of cids) {
    const p = paramsOf(el.localName, (n) => el.getAttribute(n));
    const m = matrixOf(el);
    if (p && m) out.push({ cid, kind: p.kind, params: p.params, m, closed: p.closed });
  }
  return out;
}

/** Removes constraints and cids (the export, prompt 059 E3). */
export function stripConstraints(root: Element): void {
  for (const m of Array.from(root.querySelectorAll(`metadata[${CONSTRAINTS_ATTR}]`))) m.remove();
  for (const el of Array.from(root.querySelectorAll(`[${CID_ATTR}]`))) el.removeAttribute(CID_ATTR);
}
