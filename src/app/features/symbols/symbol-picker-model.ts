import { SymbolRef } from '../../core/symbols/symbol-library.models';
import { SymbolInfo, SymbolProvider } from './symbol-provider';
import { searchSymbols } from './symbol-search';
import { allSymbols, SetSymbol } from './symbol.service';

/**
 * What the symbol picker lists (prompt 084, design E13), pure: one set, all sets (one search over
 * every loaded set) or the recently used symbols (filtered by the search).
 */

/** Pseudo sets of the set choice. */
export const ALL_SETS = 'all';
export const RECENT_SETS = 'recent';

export type PickerItem = SetSymbol;

export function itemKey(i: { set: string; id: string }): string {
  return `${i.set}:${i.id}`;
}

/** The sets a mode needs loaded. */
export function setsFor(
  mode: string,
  providers: readonly SymbolProvider[],
  recent: readonly SymbolRef[],
): SymbolProvider[] {
  if (mode === ALL_SETS) return [...providers];
  if (mode === RECENT_SETS) return providers.filter((p) => recent.some((r) => r.set === p.id));
  return providers.filter((p) => p.id === mode);
}

function infoOf(p: SymbolProvider | undefined, id: string): SymbolInfo | undefined {
  return p?.loaded ? p.all().find((i) => i.id === id) : undefined;
}

export function pickerItems(
  mode: string,
  providers: readonly SymbolProvider[],
  recent: readonly SymbolRef[],
  q: string,
  limit: number,
): { items: PickerItem[]; total: number } {
  if (mode === ALL_SETS) {
    return searchSymbols(allSymbols(providers.filter((p) => p.loaded)), q, limit);
  }
  if (mode === RECENT_SETS) {
    const list = recent.flatMap((r) => {
      const info = infoOf(
        providers.find((p) => p.id === r.set),
        r.id,
      );
      return info ? [{ ...info, set: r.set }] : [];
    });
    return q.trim()
      ? searchSymbols(list, q, limit)
      : { items: list.slice(0, limit), total: list.length };
  }
  const p = providers.find((x) => x.id === mode);
  if (!p?.loaded) return { items: [], total: 0 };
  const found = p.search(q, limit);
  return { items: found.items.map((i) => ({ ...i, set: p.id })), total: found.total };
}

/**
 * The preview paint of a value (design 084 E13): `none` stays, a colour is the text colour – or
 * itself for a set that keeps its colours (own symbols); no value = not set.
 */
export function previewPaint(v: string | undefined, colored: boolean): string | null {
  if (v === undefined) return null;
  if (v === 'none') return 'none';
  return colored ? v : 'currentColor';
}
