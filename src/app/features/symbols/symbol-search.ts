import { SymbolInfo } from './symbol-provider';

/**
 * Search of a symbol set (design 013 E18), pure: every word must occur (without case, `-` = space)
 * in the name or a tag; name matches before tag matches, then by name. Empty = all by name.
 */

const norm = (s: string) => s.toLowerCase().replace(/[-_]+/g, ' ').trim();

export function searchSymbols(
  all: readonly SymbolInfo[],
  q: string,
  limit: number,
): { items: SymbolInfo[]; total: number } {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return { items: all.slice(0, limit), total: all.length };
  const scored: { s: SymbolInfo; rank: number }[] = [];
  for (const s of all) {
    const name = norm(s.name);
    const tags = s.tags.map(norm);
    let rank = 0;
    let ok = true;
    for (const w of words) {
      if (name.includes(w)) continue;
      if (tags.some((t) => t.includes(w))) rank = 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // a name starting with the query first
    if (rank === 0 && !name.startsWith(words[0])) rank = 0.5;
    scored.push({ s, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name));
  return { items: scored.slice(0, limit).map((x) => x.s), total: scored.length };
}
