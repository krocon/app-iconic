import { inject, Injectable, signal } from '@angular/core';
import { fmt } from '../../shared/geometry/align';
import { Point } from '../../shared/geometry/view-transform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { AddService } from '../commands/add.service';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { SYMBOL_PROVIDERS } from './symbol-providers';
import { SymbolInfo, SymbolProvider, SymbolSvg } from './symbol-provider';
import { SymbolLibraryService } from './symbol-library.service';
import { searchSymbols } from './symbol-search';

const T = TOOLS_TEXTS.symbol;

/** Default size of an inserted symbol (half the canvas). */
export const SYMBOL_SIZE = 512;

type Args = Record<string, unknown> | undefined;

export interface SymbolPlacement {
  size: number;
  /** Centre in the parent's user space. */
  center: Point;
  /** Replaces the black of the set (stroke and `currentColor` fills). */
  stroke?: string;
}

/**
 * The group to insert (design 013 E19): the provider's `<g>` moved and scaled so that the
 * symbol's box (`width × height`) is `size` wide and centred on `center`. Pure.
 */
export function placeSymbol(svg: SymbolSvg, p: SymbolPlacement): ElementSpec {
  const s = p.size / svg.width;
  const x = p.center.x - p.size / 2;
  const y = p.center.y - (svg.height * s) / 2;
  const recolor = (e: ElementSpec): ElementSpec => ({
    ...e,
    attrs: Object.fromEntries(
      Object.entries(e.attrs).map(([k, v]) => [
        k,
        p.stroke && (k === 'stroke' || k === 'fill') && v === BLACK ? p.stroke : v,
      ]),
    ),
    children: e.children?.map(recolor),
  });
  const g = recolor(svg.group);
  return {
    ...g,
    attrs: { ...g.attrs, transform: `translate(${fmt(x)} ${fmt(y)}) scale(${fmt(s)})` },
  };
}

/** A match of a search over several sets (prompt 084). */
export type SetSymbol = SymbolInfo & { set: string };

/** Every symbol of `providers` (loaded ones) with its set, for the search over all sets. */
export function allSymbols(providers: readonly SymbolProvider[]): SetSymbol[] {
  return providers.flatMap((p) => p.all().map((i) => ({ ...i, set: p.id })));
}

/**
 * Symbols (design 013 E15–E21, 084): the providers (the sets of the app and "My Symbols"), the last
 * choice of the session, the picker, the recently used ones and the insertion – one undo step
 * "Add Symbol" at the place of design 008 E2.
 */
@Injectable({ providedIn: 'root' })
export class SymbolService {
  private readonly add = inject(AddService);
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);
  readonly library = inject(SymbolLibraryService);
  readonly providers: readonly SymbolProvider[] = [...SYMBOL_PROVIDERS, this.library.mine];
  /** Last choice of the session (design 013 E20; persistent with prompt 015). */
  readonly last = signal({ set: SYMBOL_PROVIDERS[0].id, query: '', size: SYMBOL_SIZE, weight: 2 });

  /**
   * The AI's `find_symbols { query?, set?, limit }` (prompt 084): matches over one or every set
   * (each loaded on demand); an empty query = the recently used symbols.
   */
  async find(query: string, set: string | undefined, limit: number): Promise<SetSymbol[]> {
    const sets = set ? this.providers.filter((p) => p.id === set) : this.providers;
    await this.library.refresh();
    await Promise.all(sets.map((p) => p.load().catch(() => undefined)));
    if (!query.trim()) {
      return this.library
        .recent()
        .filter((r) => sets.some((p) => p.id === r.set))
        .flatMap((r) => {
          const info = this.provider(r.set)
            ?.all()
            .find((i) => i.id === r.id);
          return info ? [{ ...info, set: r.set }] : [];
        })
        .slice(0, limit);
    }
    return searchSymbols(allSymbols(sets), query, limit).items;
  }

  provider(id: string | undefined): SymbolProvider | null {
    return this.providers.find((p) => p.id === (id ?? this.providers[0].id)) ?? null;
  }

  openPicker(): void {
    this.dialogs.show('symbolPicker');
  }

  /** `add.symbol { set?, id, size?, weight?, stroke?, x?, y?, parent?, index? }` (AI). */
  async addFromArgs(args: Record<string, unknown>): Promise<boolean> {
    const provider = this.provider(typeof args['set'] === 'string' ? args['set'] : undefined);
    if (!provider || typeof args['id'] !== 'string') {
      this.files.notice.set(T.unknown);
      return false;
    }
    try {
      await provider.load();
    } catch {
      this.files.notice.set(T.loadFailed);
      return false;
    }
    const num = (k: string) => (typeof args[k] === 'number' ? (args[k] as number) : undefined);
    return this.insert(provider, args['id'], {
      size: num('size'),
      weight: num('weight'),
      stroke: typeof args['stroke'] === 'string' ? args['stroke'] : undefined,
      x: num('x'),
      y: num('y'),
      args,
    });
  }

  /** Inserts symbol `id` of `provider` (loaded); `false` if it does not exist or does not fit. */
  insert(
    provider: SymbolProvider,
    id: string,
    o: { size?: number; weight?: number; stroke?: string; x?: number; y?: number; args?: Args },
  ): Promise<boolean> {
    const svg = provider.toSvg(id, { weight: o.weight });
    if (!svg) {
      this.files.notice.set(T.unknown);
      return Promise.resolve(false);
    }
    const size = o.size ?? SYMBOL_SIZE;
    const place = { parent: o.args?.['parent'], index: o.args?.['index'] };
    const args = Object.fromEntries(Object.entries(place).filter(([, v]) => v !== undefined));
    return this.add
      .insertBuilt('addSymbol', args, (c) => {
        const center = { x: o.x ?? c.x, y: o.y ?? c.y };
        return [buildElement(placeSymbol(svg, { size, center, stroke: o.stroke }))];
      })
      .then((ok) => {
        if (ok) void this.library.recordUse({ set: provider.id, id });
        return ok;
      });
  }
}
