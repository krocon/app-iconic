import { urlId } from '../../shared/controls/color-value';
import {
  CompositeCommand,
  DocCommand,
  InsertDefinition,
  RemoveAttribute,
  RemoveNode,
  ReplaceNode,
  SetAttribute,
} from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { elementsOf } from '../document/svg/node-ids';

/**
 * Effects of an SVG element (prompt 076 E1), pure: outer shadow, inner shadow and blur – each at
 * most once – written as ONE managed `<filter>` per element in `<defs>`. The list lives in the
 * filter's `data-effects` (JSON; `data-ai-*` would be stripped on save) and the primitives are
 * built from it, so reading never parses primitives. A filter without `data-effects` is foreign:
 * it is left alone.
 */
export type EffectKind = 'dropShadow' | 'innerShadow' | 'blur';

export const EFFECT_KINDS: readonly EffectKind[] = ['dropShadow', 'innerShadow', 'blur'];

export interface Effect {
  kind: EffectKind;
  on: boolean;
  /** `#RRGGBB` (shadows). */
  color: string;
  /** 0…1 (shadows). */
  opacity: number;
  dx: number;
  dy: number;
  /** Blur radius (standard deviation) in user units. */
  radius: number;
}

export const EFFECTS_ATTR = 'data-effects';

export function defaultEffect(kind: EffectKind): Effect {
  return kind === 'blur'
    ? { kind, on: true, color: '#000000', opacity: 1, dx: 0, dy: 0, radius: 4 }
    : {
        kind,
        on: true,
        color: '#000000',
        opacity: kind === 'dropShadow' ? 0.35 : 0.5,
        dx: 0,
        dy: kind === 'dropShadow' ? 8 : 4,
        radius: kind === 'dropShadow' ? 8 : 4,
      };
}

const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const HEX = /^#[0-9a-f]{6}$/i;

/** One effect from outside (a file, the AI): every field checked, defaults for the rest. */
export function cleanEffect(raw: unknown): Effect | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!EFFECT_KINDS.includes(o['kind'] as EffectKind)) return null;
  const d = defaultEffect(o['kind'] as EffectKind);
  return {
    kind: d.kind,
    on: typeof o['on'] === 'boolean' ? o['on'] : true,
    color:
      typeof o['color'] === 'string' && HEX.test(o['color']) ? o['color'].toUpperCase() : d.color,
    opacity: num(o['opacity'], 0, 1, d.opacity),
    dx: num(o['dx'], -1000, 1000, d.dx),
    dy: num(o['dy'], -1000, 1000, d.dy),
    radius: num(o['radius'], 0, 500, d.radius),
  };
}

/** The effects of a managed filter; `null` for a foreign one. */
export function readEffects(filter: Element): Effect[] | null {
  const raw = filter.getAttribute(EFFECTS_ATTR);
  if (raw === null) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const out: Effect[] = [];
    for (const e of list) {
      const c = cleanEffect(e);
      if (c && !out.some((x) => x.kind === c.kind)) out.push(c);
    }
    return out;
  } catch {
    return [];
  }
}

const f = (n: number) => String(Math.round(n * 1000) / 1000);
/** resvg draws nothing for a drop shadow with `stdDeviation="0"` (Rust test): a hair more. */
const sd = (n: number) => f(Math.max(0.01, n));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The `<filter>` of `effects` (blur, then inner shadow, then outer shadow underneath). */
export function filterMarkup(id: string, effects: readonly Effect[]): string {
  const by = (k: EffectKind) => effects.find((e) => e.kind === k && e.on);
  const parts: string[] = [];
  let cur = 'SourceGraphic';
  const blur = by('blur');
  if (blur && blur.radius > 0) {
    parts.push(`<feGaussianBlur in="${cur}" stdDeviation="${f(blur.radius)}" result="fx-blur"/>`);
    cur = 'fx-blur';
  }
  const inner = by('innerShadow');
  if (inner) {
    parts.push(
      `<feOffset in="SourceAlpha" dx="${f(inner.dx)}" dy="${f(inner.dy)}" result="fx-io"/>`,
      `<feGaussianBlur in="fx-io" stdDeviation="${sd(inner.radius)}" result="fx-ib"/>`,
      `<feComposite in="SourceAlpha" in2="fx-ib" operator="arithmetic" k2="1" k3="-1" result="fx-ii"/>`,
      `<feFlood flood-color="${inner.color}" flood-opacity="${f(inner.opacity)}" result="fx-if"/>`,
      `<feComposite in="fx-if" in2="fx-ii" operator="in" result="fx-is"/>`,
      `<feComposite in="fx-is" in2="${cur}" operator="over" result="fx-inner"/>`,
    );
    cur = 'fx-inner';
  }
  const drop = by('dropShadow');
  if (drop) {
    parts.push(
      `<feDropShadow in="${cur}" dx="${f(drop.dx)}" dy="${f(drop.dy)}" stdDeviation="${sd(drop.radius)}" ` +
        `flood-color="${drop.color}" flood-opacity="${f(drop.opacity)}" result="fx-drop"/>`,
    );
  }
  // every effect off: the graphic as it is (an empty filter would paint nothing)
  if (!parts.length) parts.push(`<feOffset in="SourceGraphic" dx="0" dy="0"/>`);
  const json = JSON.stringify(effects);
  return (
    `<filter xmlns="http://www.w3.org/2000/svg" id="${id}" x="-50%" y="-50%" width="200%" height="200%" ` +
    `color-interpolation-filters="sRGB" ${EFFECTS_ATTR}="${esc(json)}">${parts.join('')}</filter>`
  );
}

/** The filter `el` refers to (in its asset). */
export function filterOf(el: Element, root: Element): Element | null {
  const id = urlId(el.getAttribute('filter'));
  if (!id) return null;
  return (
    elementsOf(root).find((e) => e.localName === 'filter' && e.getAttribute('id') === id) ?? null
  );
}

/** How many elements of the asset use the filter `id`. */
function users(root: Element, id: string): number {
  return elementsOf(root).filter((e) => urlId(e.getAttribute('filter')) === id).length;
}

function freshId(root: Element, base: string): string {
  const taken = new Set(elementsOf(root).map((e) => e.getAttribute('id')));
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** What the element's filter is: none, managed (with its effects), or foreign. */
export type FilterState =
  { kind: 'none' } | { kind: 'managed'; effects: Effect[]; shared: boolean } | { kind: 'foreign' };

export function filterState(el: Element, root: Element): FilterState {
  const fl = filterOf(el, root);
  if (!fl) return el.hasAttribute('filter') ? { kind: 'foreign' } : { kind: 'none' };
  const effects = readEffects(fl);
  if (!effects) return { kind: 'foreign' };
  return { kind: 'managed', effects, shared: users(root, fl.getAttribute('id')!) > 1 };
}

/**
 * The command giving `ref` the effects `effects` (one undo step "Change Effects"): a new managed
 * filter, its update in place, a copy when the filter is shared (like shared gradients, 032), or –
 * an empty list – the filter attribute (and the filter, when nobody else uses it) removed. `null`
 * for a foreign filter or no change.
 */
export function effectsCommand(
  doc: IconDocument,
  ref: NodeRef,
  effects: readonly Effect[],
): DocCommand | null {
  const el = doc.node(ref);
  const root = doc.assets.get(ref.asset)?.svg?.root;
  if (!el || !root) return null;
  const state = filterState(el, root);
  if (state.kind === 'foreign') return null;
  const fl = filterOf(el, root);
  const flRef = fl ? doc.refOf(fl) : null;
  const cmds: DocCommand[] = [];
  if (!effects.length) {
    if (state.kind === 'none') return null;
    cmds.push(new RemoveAttribute(ref, 'filter'));
    if (flRef && state.kind === 'managed' && !state.shared) cmds.push(new RemoveNode(flRef));
  } else if (state.kind === 'managed' && !state.shared && flRef) {
    if (JSON.stringify(state.effects) === JSON.stringify(effects)) return null;
    cmds.push(new ReplaceNode(flRef, filterMarkup(fl!.getAttribute('id')!, effects)));
  } else {
    const id = freshId(root, 'effects');
    cmds.push(
      new InsertDefinition(ref.asset, filterMarkup(id, effects), 'changeEffects'),
      new SetAttribute(ref, 'filter', `url(#${id})`, 'changeEffects'),
    );
  }
  return new CompositeCommand('changeEffects', cmds);
}
