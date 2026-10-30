import { ElementSpec } from '../commands/element-defaults';

/**
 * The plug-in interface of the symbol picker (design 013 E16): one provider per symbol set –
 * further sets only need another provider in `SYMBOL_PROVIDERS` (`symbol-providers.ts`). No SF
 * Symbols (their licence forbids app icons, legacy §8). Sets of prompt 084: Tabler, Phosphor, and the
 * user's own symbols ("mine").
 */

export interface SymbolInfo {
  id: string;
  /** Shown and searched ("arrow down"). */
  name: string;
  tags: readonly string[];
}

/** A number the set lets the user choose (Lucide: the stroke weight). */
export interface SymbolVariant {
  key: 'weight';
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SymbolLicense {
  /** "ISC License" */
  name: string;
  spdx: string;
  url: string;
  /** The npm package the data comes from – its licence text is in THIRD-PARTY-NOTICES.txt (084). */
  package: string;
}

export interface SymbolOptions {
  weight?: number;
}

/** One symbol, ready to show and to insert. */
export interface SymbolSvg {
  /** Size of the symbol's own coordinate system (Lucide: 24 × 24). */
  width: number;
  height: number;
  /** Standalone `<svg viewBox>` (preview). */
  markup: string;
  /** What is inserted: one `<g>` with the paint of the set and every element as `<path>`. */
  group: ElementSpec;
}

export interface SymbolProvider {
  readonly id: string;
  readonly name: string;
  /** `null` = the user's own symbols (prompt 084). */
  readonly license: SymbolLicense | null;
  readonly variants: readonly SymbolVariant[];
  /** The preview shows the symbol's own colours (own symbols); else the text colour. */
  readonly colored?: boolean;
  /** Loads the data (lazy chunk); resolves at once when loaded. */
  load(): Promise<void>;
  readonly loaded: boolean;
  /** Matches of `q` (design 013 E18), at most `limit`; `total` = all matches. */
  search(q: string, limit: number): { items: SymbolInfo[]; total: number };
  /** Every symbol of the loaded set, by name (the search over all sets, prompt 084). */
  all(): readonly SymbolInfo[];
  toSvg(id: string, opts?: SymbolOptions): SymbolSvg | null;
}
