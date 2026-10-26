/** Appearance of the preview (design 004 E7); "tinted" and monochrome follow in 010. */
export type Appearance = 'light' | 'dark';

/**
 * The value of an Icon Composer "specialization" list (`fill-specializations`,
 * `image-name-specializations`: `[{ "appearance"?: "dark", "value": … }]`) for `appearance`:
 * an entry with that appearance, else one without, else `fallback`. Unknown entries are skipped.
 */
export function specialized(specs: unknown, appearance: Appearance, fallback: unknown): unknown {
  if (!Array.isArray(specs)) return fallback;
  const entries = specs.filter(
    (s): s is { appearance?: unknown; value: unknown } =>
      typeof s === 'object' && s !== null && 'value' in s,
  );
  const exact = entries.find((s) => s.appearance === appearance);
  if (exact) return exact.value;
  const plain = entries.find((s) => s.appearance === undefined);
  return plain ? plain.value : fallback;
}
