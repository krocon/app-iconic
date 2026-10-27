import { AppearanceKey, resolveSpecialized } from '../document/model/specializations';

/** Appearance of the preview (design 004 E7); "tinted" is edited but not previewed (010 E2). */
export type Appearance = 'light' | 'dark';

/** The inspector's appearance for a preview appearance (light = the base value). */
export const appearanceKey = (a: Appearance): AppearanceKey => (a === 'dark' ? 'dark' : 'default');

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
