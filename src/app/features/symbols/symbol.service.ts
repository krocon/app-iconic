import { inject, Injectable, signal } from '@angular/core';
import { fmt } from '../../shared/geometry/align';
import { Point } from '../../shared/geometry/view-transform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { AddService } from '../commands/add.service';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { LucideProvider } from './lucide-provider';
import { SymbolProvider, SymbolSvg } from './symbol-provider';

const T = TOOLS_TEXTS.symbol;

/** Default size of an inserted symbol (half the canvas). */
export const SYMBOL_SIZE = 512;

/** The symbol sets of the app (design 013 E16); the first is the default. */
export const SYMBOL_PROVIDERS: readonly SymbolProvider[] = [new LucideProvider()];

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

/**
 * Symbols (design 013 E15–E21): the providers, the last choice of the session, the picker and
 * the insertion – one undo step "Add Symbol" at the place of design 008 E2.
 */
@Injectable({ providedIn: 'root' })
export class SymbolService {
  private readonly add = inject(AddService);
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);
  readonly providers = SYMBOL_PROVIDERS;
  /** Last choice of the session (design 013 E20; persistent with prompt 015). */
  readonly last = signal({ set: SYMBOL_PROVIDERS[0].id, query: '', size: SYMBOL_SIZE, weight: 2 });

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
    return this.add.insertBuilt('addSymbol', args, (c) => {
      const center = { x: o.x ?? c.x, y: o.y ?? c.y };
      return [buildElement(placeSymbol(svg, { size, center, stroke: o.stroke }))];
    });
  }
}
