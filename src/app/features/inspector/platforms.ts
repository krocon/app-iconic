/**
 * `supported-platforms` (design 010 E10): `squares` = `"shared"` (belegt) or a list of `iOS` /
 * `macOS` (schema), `circles` = `["watchOS"]`. A value we do not know is shown and kept. Pure.
 */

export type SquaresChoice = 'shared' | 'iOS' | 'macOS' | 'iOS+macOS' | 'off' | 'other';

export const SQUARES_CHOICES: readonly SquaresChoice[] = [
  'shared',
  'iOS',
  'macOS',
  'iOS+macOS',
  'off',
];

export function readSquares(v: unknown): SquaresChoice {
  if (v === undefined) return 'off';
  if (v === 'shared') return 'shared';
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return 'other';
  const set = new Set(v);
  if (set.size !== v.length) return 'other';
  if (v.length === 1 && set.has('iOS')) return 'iOS';
  if (v.length === 1 && set.has('macOS')) return 'macOS';
  if (v.length === 2 && set.has('iOS') && set.has('macOS')) return 'iOS+macOS';
  return 'other';
}

/** The value for a choice; `undefined` = no `squares` key. */
export function squaresValue(choice: Exclude<SquaresChoice, 'other'>): unknown {
  switch (choice) {
    case 'shared':
      return 'shared';
    case 'iOS':
      return ['iOS'];
    case 'macOS':
      return ['macOS'];
    case 'iOS+macOS':
      return ['iOS', 'macOS'];
    case 'off':
      return undefined;
  }
}

export function hasWatch(circles: unknown): boolean {
  return circles === 'watchOS' || (Array.isArray(circles) && circles.includes('watchOS'));
}

/** `circles` with watchOS on or off; other entries stay; empty → `undefined` (no key). */
export function circlesWith(circles: unknown, on: boolean): unknown {
  const list = Array.isArray(circles) ? circles : typeof circles === 'string' ? [circles] : [];
  if (on) return hasWatch(circles) ? circles : [...list, 'watchOS'];
  if (!hasWatch(circles)) return circles;
  const rest = list.filter((x) => x !== 'watchOS');
  return rest.length ? rest : undefined;
}
