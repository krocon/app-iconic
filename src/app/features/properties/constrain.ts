import { CONSTRAIN_PAIRS } from './property-spec';

/**
 * Constrain proportions (design 009 E6, legacy "Constrain proportions"): when `name` changes to
 * `value`, its partner follows in the ratio of both values at the start of the edit. Pure.
 */

/** The partner of `name` (`width` ↔ `height`, `rx` ↔ `ry`), `null` if it has none. */
export function partnerOf(name: string): string | null {
  return Object.hasOwn(CONSTRAIN_PAIRS, name) ? CONSTRAIN_PAIRS[name] : null;
}

/**
 * The new partner value: `partner · value / own` from the values before the edit; `null` if one
 * of them is missing, zero or not a number (nothing follows then).
 */
export function follow(value: number, own: number | null, partner: number | null): number | null {
  if (own === null || partner === null || !Number.isFinite(value)) return null;
  if (!Number.isFinite(own) || !Number.isFinite(partner) || own === 0 || partner === 0) return null;
  return (partner * value) / own;
}
