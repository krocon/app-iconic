import { AppearanceKey, resolveSpecialized } from '../document/model/specializations';

/**
 * Appearance of the preview (design 004 E7); "tinted" since prompt 077 E2 – an approximation:
 * the tinted specializations apply, then luminance × tint over the whole composition (`tinted.ts`).
 */
export type Appearance = 'light' | 'dark' | 'tinted';

export const APPEARANCE_LIST: readonly Appearance[] = ['light', 'dark', 'tinted'];

/** The inspector's appearance for a preview appearance (light = the base value). */
export const appearanceKey = (a: Appearance): AppearanceKey => (a === 'light' ? 'default' : a);

/**
 * The value of an Icon Composer "specialization" list (`fill-specializations`,
 * `image-name-specializations`: `[{ "appearance"?: "dark", "value": … }]`) for `appearance`:
 * an entry with that appearance, else the base entry, else `fallback`. Entries with an `idiom`
 * (platform variants) or unknown appearances are skipped (design 010 E2).
 */
export function specialized(specs: unknown, appearance: Appearance, fallback: unknown): unknown {
  if (!Array.isArray(specs)) return fallback;
  return resolveSpecialized(
    { x: fallback, 'x-specializations': specs },
    'x',
    appearanceKey(appearance),
    fallback,
  ).value;
}

/** A field `key` of `obj` (group, layer, root) for `appearance`, specializations first. */
export function fieldFor(
  obj: unknown,
  key: string,
  appearance: Appearance,
  fallback: unknown,
): unknown {
  return resolveSpecialized(obj, key, appearanceKey(appearance), fallback).value;
}
