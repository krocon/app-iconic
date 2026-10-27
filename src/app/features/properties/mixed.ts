/**
 * Values of a multiple selection (design 009 E5, legacy "mixed"): one value for all, or mixed.
 * Pure.
 */
export type Combined =
  { kind: 'none' } | { kind: 'same'; value: string | null } | { kind: 'mixed' };

/** `none` for no values; `same` when every value is equal (also all `null`); else `mixed`. */
export function combine(values: readonly (string | null)[]): Combined {
  if (values.length === 0) return { kind: 'none' };
  const first = values[0];
  return values.every((v) => v === first) ? { kind: 'same', value: first } : { kind: 'mixed' };
}
