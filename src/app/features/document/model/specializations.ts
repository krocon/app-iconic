import { getIn, JsonPath, setIn } from './icon-json';

/**
 * Icon Composer's "specializations" (design 010 E2, E3): a field `X` that varies by appearance is
 * written as `X-specializations: [{ appearance?, idiom?, value }]` – never both. The list starts
 * with the entry without appearance (the base), then `dark`, then `tinted`. Entries with an
 * `idiom` or an unknown appearance are kept as they are and skipped when reading. Pure.
 */

/** The appearances the inspector edits; `default` = the base value. */
export type AppearanceKey = 'default' | 'dark' | 'tinted';

export const APPEARANCE_KEYS: readonly AppearanceKey[] = ['default', 'dark', 'tinted'];

/** One change of `icon.json`: `value: undefined` removes the key / array element. */
export interface JsonEdit {
  path: JsonPath;
  value: unknown;
}

type Obj = Record<string, unknown>;
type Entry = Obj & { value: unknown };

export const specKey = (key: string) => `${key}-specializations`;

function isEntry(e: unknown): e is Entry {
  return typeof e === 'object' && e !== null && !Array.isArray(e) && 'value' in e;
}

/** The base entry: neither appearance nor idiom. */
export function isBaseEntry(e: unknown): e is Entry {
  return isEntry(e) && !('appearance' in e) && !('idiom' in e);
}

function isVariant(e: unknown, appearance: AppearanceKey): e is Entry {
  return isEntry(e) && e['appearance'] === appearance && !('idiom' in e);
}

/** Order of the entries Icon Composer writes: base, dark, tinted, then anything else. */
function rank(e: unknown): number {
  if (isBaseEntry(e)) return 0;
  if (isVariant(e, 'dark')) return 1;
  if (isVariant(e, 'tinted')) return 2;
  return 3;
}

function asObj(v: unknown): Obj | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined;
}

export interface Resolved {
  /** The value that applies (the `fallback` when nothing is set). */
  value: unknown;
  /** Where it comes from: an entry of this appearance, the base, or the built-in default. */
  source: 'variant' | 'base' | 'default';
  /** Entries with an `idiom` or an unknown appearance exist (kept, not edited). */
  otherVariants: boolean;
}

/** The value of `key` of `obj` for `appearance` (design 010 E2). */
export function resolveSpecialized(
  obj: unknown,
  key: string,
  appearance: AppearanceKey,
  fallback: unknown,
): Resolved {
  const o = asObj(obj);
  const list = o?.[specKey(key)];
  if (Array.isArray(list)) {
    const otherVariants = list.some((e) => rank(e) === 3);
    const own = appearance === 'default' ? undefined : list.find((e) => isVariant(e, appearance));
    if (own) return { value: own.value, source: 'variant', otherVariants };
    const base = list.find(isBaseEntry);
    if (base) return { value: base.value, source: 'base', otherVariants };
    if (o && Object.hasOwn(o, key)) return { value: o[key], source: 'base', otherVariants };
    return { value: fallback, source: 'default', otherVariants };
  }
  if (o && Object.hasOwn(o, key)) return { value: o[key], source: 'base', otherVariants: false };
  return { value: fallback, source: 'default', otherVariants: false };
}

/** Is there an entry of exactly this appearance (not for `default`)? */
export function hasVariant(obj: unknown, key: string, appearance: AppearanceKey): boolean {
  const list = asObj(obj)?.[specKey(key)];
  return (
    appearance !== 'default' && Array.isArray(list) && list.some((e) => isVariant(e, appearance))
  );
}

/** The path (relative to `obj`) of the value that `appearance` writes, if it exists already. */
function ownPath(obj: Obj | undefined, key: string, appearance: AppearanceKey): JsonPath | null {
  const list = obj?.[specKey(key)];
  if (Array.isArray(list)) {
    const i =
      appearance === 'default'
        ? list.findIndex(isBaseEntry)
        : list.findIndex((e) => isVariant(e, appearance));
    if (i >= 0) return [specKey(key), i, 'value'];
    return appearance === 'default' && obj && Object.hasOwn(obj, key) ? [key] : null;
  }
  return appearance === 'default' && obj && Object.hasOwn(obj, key) ? [key] : null;
}

const under = (base: JsonPath, edits: JsonEdit[]): JsonEdit[] =>
  edits.map((e) => ({ path: [...base, ...e.path], value: e.value }));

/** `list` with `entry` inserted at its place in Icon Composer's order. */
function inserted(list: readonly unknown[], entry: Entry): unknown[] {
  const r = rank(entry);
  const at = list.findIndex((e) => rank(e) > r);
  const out = list.slice();
  out.splice(at < 0 ? out.length : at, 0, entry);
  return out;
}

/**
 * The edits that set `key` of the object at `objPath` to `value` for `appearance` (design 010
 * E3): the base in `default`, otherwise this appearance's entry – created when missing, `X`
 * turning into `X-specializations` on the way.
 */
export function specializedEdits(
  obj: unknown,
  objPath: JsonPath,
  key: string,
  appearance: AppearanceKey,
  value: unknown,
): JsonEdit[] {
  const o = asObj(obj);
  const own = ownPath(o, key, appearance);
  if (own) return under(objPath, [{ path: own, value }]);
  const list = o?.[specKey(key)];
  const sk = specKey(key);
  if (appearance === 'default') {
    if (Array.isArray(list)) return under(objPath, [{ path: [sk], value: [{ value }, ...list] }]);
    return under(objPath, [{ path: [key], value }]);
  }
  const entry: Entry = { appearance, value };
  if (Array.isArray(list)) return under(objPath, [{ path: [sk], value: inserted(list, entry) }]);
  if (o && Object.hasOwn(o, key)) {
    return under(objPath, [
      { path: [sk], value: [{ value: o[key] }, entry] },
      { path: [key], value: undefined },
    ]);
  }
  return under(objPath, [{ path: [sk], value: [entry] }]);
}

/**
 * Like `specializedEdits` for a part of the value (`sub`, e.g. `['opacity']` of `shadow`): when
 * the object for this appearance exists only that part is written (unknown sub-keys stay),
 * otherwise the whole value is made from the one that applies now (or `fallback`).
 */
export function specializedSubEdits(
  obj: unknown,
  objPath: JsonPath,
  key: string,
  appearance: AppearanceKey,
  sub: JsonPath,
  value: unknown,
  fallback: unknown,
): JsonEdit[] {
  if (sub.length === 0) return specializedEdits(obj, objPath, key, appearance, value);
  const o = asObj(obj);
  const own = ownPath(o, key, appearance);
  const container = own ? getIn(o, own) : undefined;
  if (own && typeof container === 'object' && container !== null) {
    return under(objPath, [{ path: [...own, ...sub], value }]);
  }
  const now = resolveSpecialized(o, key, appearance, fallback).value;
  const base = typeof now === 'object' && now !== null ? now : fallback;
  return specializedEdits(obj, objPath, key, appearance, setIn(base, sub, value));
}

/**
 * Removes the entry of `appearance` (design 010 E3): the default applies again. A list left with
 * only the base turns back into `X` (round trip byte for byte), an empty list goes away.
 */
export function removeVariantEdits(
  obj: unknown,
  objPath: JsonPath,
  key: string,
  appearance: AppearanceKey,
): JsonEdit[] {
  const o = asObj(obj);
  const sk = specKey(key);
  const list = o?.[sk];
  if (appearance === 'default' || !Array.isArray(list)) return [];
  const i = list.findIndex((e) => isVariant(e, appearance));
  if (i < 0) return [];
  const rest = list.filter((_, j) => j !== i);
  if (rest.length === 0) return under(objPath, [{ path: [sk], value: undefined }]);
  if (rest.length === 1 && isBaseEntry(rest[0]) && Object.keys(rest[0]).length === 1) {
    return under(objPath, [
      { path: [key], value: rest[0].value },
      { path: [sk], value: undefined },
    ]);
  }
  return under(objPath, [{ path: [sk, i], value: undefined }]);
}
