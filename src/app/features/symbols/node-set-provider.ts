import { fmt } from '../../shared/geometry/align';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import { asPath, LucideNode } from './lucide-provider';
import {
  SymbolInfo,
  SymbolLicense,
  SymbolOptions,
  SymbolProvider,
  SymbolSvg,
  SymbolVariant,
} from './symbol-provider';
import { searchSymbols } from './symbol-search';

/**
 * A symbol set from a generated data file (prompt 084, design E2/E3; `scripts/symbol-data.mjs`):
 * Tabler (outline, stroke icons like Lucide) and Phosphor (regular, filled outlines). Loaded
 * lazily as its own chunk. A stroke set has the weight as variant; a fill set none.
 */

/** A plain path as its `d`, anything else as `[tag, attrs]`. */
export type SetNode = string | LucideNode;

export interface SetData {
  set: string;
  version: string;
  /** Side of the icon's coordinate system (Tabler 24, Phosphor 256). */
  size: number;
  nodes: Record<string, SetNode[]>;
  tags: Record<string, string[]>;
}

export interface SetConfig {
  id: string;
  name: string;
  license: SymbolLicense;
  /** `stroke`: one group with stroke paint and the weight; `fill`: filled outlines. */
  paint: 'stroke' | 'fill';
  weight?: SymbolVariant;
  load: () => Promise<SetData>;
}

const node = (n: SetNode): LucideNode => (typeof n === 'string' ? ['path', { d: n }] : n);

export class NodeSetProvider implements SymbolProvider {
  readonly id: string;
  readonly name: string;
  readonly license: SymbolLicense;
  readonly variants: readonly SymbolVariant[];
  private data: SetData | null = null;
  private list: SymbolInfo[] = [];
  private loading: Promise<void> | null = null;

  constructor(private readonly config: SetConfig) {
    this.id = config.id;
    this.name = config.name;
    this.license = config.license;
    this.variants = config.weight ? [config.weight] : [];
  }

  get loaded(): boolean {
    return this.data !== null;
  }

  load(): Promise<void> {
    this.loading ??= this.config.load().then(
      (data) => {
        this.data = data;
        this.list = Object.keys(data.nodes)
          .sort()
          .map((id) => ({ id, name: id.replace(/-/g, ' '), tags: data.tags[id] ?? [] }));
      },
      (e: unknown) => {
        this.loading = null; // a later attempt may work
        throw e;
      },
    );
    return this.loading;
  }

  search(q: string, limit: number): { items: SymbolInfo[]; total: number } {
    return searchSymbols(this.list, q, limit);
  }

  all(): readonly SymbolInfo[] {
    return this.list;
  }

  toSvg(id: string, opts: SymbolOptions = {}): SymbolSvg | null {
    const d = this.data;
    const nodes = d && Object.hasOwn(d.nodes, id) ? d.nodes[id] : null;
    if (!d || !nodes) return null;
    const children = nodes.flatMap((n) => asPath(node(n)) ?? []);
    const w = this.config.weight;
    let attrs: Record<string, string>;
    if (this.config.paint === 'stroke' && w) {
      const raw = opts.weight ?? w.default;
      const weight = Math.min(w.max * 2, Math.max(0.1, Number.isFinite(raw) ? raw : w.default));
      attrs = {
        fill: 'none',
        stroke: BLACK,
        'stroke-width': fmt(weight),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      };
    } else {
      attrs = { fill: BLACK };
    }
    const group: ElementSpec = { tag: 'g', attrs, children };
    const markup = buildElement({
      tag: 'svg',
      attrs: { viewBox: `0 0 ${d.size} ${d.size}`, width: String(d.size), height: String(d.size) },
      children: [group],
    });
    return { width: d.size, height: d.size, markup, group };
  }
}

/** Tabler Icons, outline (design 084 E2): 24 × 24 stroke icons, stroke width = weight (default 2). */
export const TABLER = new NodeSetProvider({
  id: 'tabler',
  name: 'Tabler',
  license: {
    name: 'MIT License',
    spdx: 'MIT',
    url: 'https://github.com/tabler/tabler-icons',
    package: '@tabler/icons',
  },
  paint: 'stroke',
  weight: { key: 'weight', label: 'Weight', min: 0.5, max: 3, step: 0.25, default: 2 },
  load: () => import('./data/tabler-outline.json').then((m) => m.default as unknown as SetData),
});

/** Phosphor, regular weight (design 084 E3): 256 × 256 filled outlines, no variant. */
export const PHOSPHOR = new NodeSetProvider({
  id: 'phosphor',
  name: 'Phosphor',
  license: {
    name: 'MIT License',
    spdx: 'MIT',
    url: 'https://github.com/phosphor-icons/core',
    package: '@phosphor-icons/core',
  },
  paint: 'fill',
  load: () => import('./data/phosphor-regular.json').then((m) => m.default as unknown as SetData),
});
