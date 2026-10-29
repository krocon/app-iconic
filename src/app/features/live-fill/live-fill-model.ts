import { Point } from '../../shared/geometry/view-transform';

/**
 * A live fill (prompt 060): a `<path data-live-fill>` whose outline is the face of the
 * arrangement around its seed points – recomputed whenever the outlines change. The seeds live in
 * the path's own user space (they move with its group), as JSON in the attribute.
 */
export const LIVE_FILL_ATTR = 'data-live-fill';
/** Most seeds (faces) of one fill. */
export const MAX_SEEDS = 64;

/** Elements that never bound a face: fills themselves, dimensions, guides. */
export const NOT_BOUNDARY = `[${LIVE_FILL_ATTR}], [data-dimension], [data-guide]`;

export function readSeeds(el: Element): Point[] | null {
  const raw = el.getAttribute(LIVE_FILL_ATTR);
  if (raw === null) return null;
  try {
    const seeds = (JSON.parse(raw) as { seeds?: unknown })?.seeds;
    if (!Array.isArray(seeds)) return null;
    const out = seeds
      .slice(0, MAX_SEEDS)
      .filter(
        (s): s is [number, number] =>
          Array.isArray(s) &&
          s.length === 2 &&
          s.every((n) => typeof n === 'number' && isFinite(n)),
      )
      .map(([x, y]) => ({ x, y }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

const r = (v: number) => Math.round(v * 1000) / 1000;

export function seedsJson(seeds: readonly Point[]): string {
  return JSON.stringify({ v: 1, seeds: seeds.slice(0, MAX_SEEDS).map((p) => [r(p.x), r(p.y)]) });
}

/** Removes the live link (the export, "Detach"): the path stays as it is. */
export function stripLiveFills(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(`[${LIVE_FILL_ATTR}]`))) {
    el.removeAttribute(LIVE_FILL_ATTR);
  }
}

/** Where a new fill goes in `parent`: below every painted child (after defs, metadata, title …). */
export function bottomIndex(parent: Element): number {
  const skip = new Set(['defs', 'metadata', 'title', 'desc', 'style']);
  const kids = Array.from(parent.children);
  const i = kids.findIndex((k) => !skip.has(k.localName));
  return i < 0 ? kids.length : i;
}
