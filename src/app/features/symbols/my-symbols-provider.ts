import { LibrarySymbol } from '../../core/symbols/symbol-library.models';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { symbolFromMarkup } from './symbol-flatten';
import { SymbolInfo, SymbolProvider, SymbolSvg } from './symbol-provider';
import { searchSymbols } from './symbol-search';

/** The id of the own set (recent entries, `add.symbol { set: 'mine' }`). */
export const MINE = 'mine';

/**
 * "My Symbols" (prompt 084, design E11): the user's own library from the backend. The list comes
 * from `SymbolLibraryService` (`setAll` after every change); `load` asks the backend the first
 * time. Previews keep the symbols' own colours.
 */
export class MySymbolsProvider implements SymbolProvider {
  readonly id = MINE;
  readonly license = null;
  readonly variants = [];
  readonly colored = true;
  private list: SymbolInfo[] = [];
  private markup = new Map<string, string>();
  private svgs = new Map<string, SymbolSvg | null>();
  private loading: Promise<void> | null = null;
  private ready = false;

  constructor(private readonly loader: () => Promise<LibrarySymbol[]>) {}

  get name(): string {
    return TOOLS_TEXTS.symbol.mine;
  }

  get loaded(): boolean {
    return this.ready;
  }

  load(): Promise<void> {
    this.loading ??= this.loader().then(
      (list) => this.setAll(list),
      (e: unknown) => {
        this.loading = null;
        throw e;
      },
    );
    return this.loading;
  }

  /** The library as the backend sent it (sorted by name). */
  setAll(list: readonly LibrarySymbol[]): void {
    this.list = list.map((s) => ({ id: s.id, name: s.name, tags: s.tags }));
    this.markup = new Map(list.map((s) => [s.id, s.svg]));
    this.svgs.clear();
    this.ready = true;
    this.loading ??= Promise.resolve();
  }

  info(id: string): SymbolInfo | undefined {
    return this.list.find((s) => s.id === id);
  }

  search(q: string, limit: number): { items: SymbolInfo[]; total: number } {
    return searchSymbols(this.list, q, limit);
  }

  all(): readonly SymbolInfo[] {
    return this.list;
  }

  toSvg(id: string): SymbolSvg | null {
    if (!this.svgs.has(id)) {
      const m = this.markup.get(id);
      this.svgs.set(id, m === undefined ? null : symbolFromMarkup(m));
    }
    return this.svgs.get(id) ?? null;
  }
}
