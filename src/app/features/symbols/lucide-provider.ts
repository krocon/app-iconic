import { fmt } from '../../shared/geometry/align';
import { shapeToPath } from '../../shared/geometry/shape-path';
import { allowedAttribute } from '../commands/add-args';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import {
  SymbolInfo,
  SymbolOptions,
  SymbolProvider,
  SymbolSvg,
  SymbolVariant,
} from './symbol-provider';
import { searchSymbols } from './symbol-search';

/**
 * Lucide (https://lucide.dev, ISC License; icons derived from Feather under MIT – text in
 * THIRD-PARTY-NOTICES.txt) as symbol set (design 013 E15): 24 × 24 stroke icons from the npm
 * package `lucide-static` (`icon-nodes.json` + `tags.json`), loaded lazily as their own chunks
 * (design 013 E17). The weight is the stroke width in icon units (Lucide default 2).
 */

type LucideNode = [string, Record<string, string>];
export interface LucideData {
  nodes: Record<string, LucideNode[]>;
  tags: Record<string, string[]>;
}

/** The data of the package – only fetched when the picker (or an AI call) needs it. */
export async function loadLucideData(): Promise<LucideData> {
  const [nodes, tags] = await Promise.all([
    import('lucide-static/icon-nodes.json'),
    import('lucide-static/tags.json'),
  ]);
  return {
    nodes: nodes.default as unknown as Record<string, LucideNode[]>,
    tags: tags.default as unknown as Record<string, string[]>,
  };
}

const SIZE = 24;
/** Attributes that are geometry of a basic shape (they become the path's `d`). */
const GEOMETRY = new Set([
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
]);

export const LUCIDE_WEIGHT: SymbolVariant = {
  key: 'weight',
  label: 'Weight',
  min: 0.5,
  max: 3,
  step: 0.25,
  default: 2,
};

/** One element of a Lucide icon as `<path>` (its other attributes kept, `currentColor` black). */
function asPath([tag, attrs]: LucideNode): ElementSpec | null {
  const d = shapeToPath(tag, attrs);
  if (!d) return null;
  const rest: Record<string, string> = { d };
  for (const [k, v] of Object.entries(attrs)) {
    if (GEOMETRY.has(k) || !allowedAttribute(k) || k === 'key') continue;
    rest[k] = v === 'currentColor' ? BLACK : v;
  }
  return { tag: 'path', attrs: rest };
}

export class LucideProvider implements SymbolProvider {
  readonly id = 'lucide';
  readonly name = 'Lucide';
  readonly license = {
    name: 'ISC License',
    spdx: 'ISC',
    url: 'https://lucide.dev/license',
  };
  readonly variants = [LUCIDE_WEIGHT];
  private data: LucideData | null = null;
  private list: SymbolInfo[] = [];
  private loading: Promise<void> | null = null;

  constructor(private readonly loader: () => Promise<LucideData> = loadLucideData) {}

  get loaded(): boolean {
    return this.data !== null;
  }

  load(): Promise<void> {
    this.loading ??= this.loader().then(
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

  toSvg(id: string, opts: SymbolOptions = {}): SymbolSvg | null {
    const nodes = this.data && Object.hasOwn(this.data.nodes, id) ? this.data.nodes[id] : null;
    if (!nodes) return null;
    const w = opts.weight ?? LUCIDE_WEIGHT.default;
    const weight = Math.min(LUCIDE_WEIGHT.max * 2, Math.max(0.1, Number.isFinite(w) ? w : 2));
    const group: ElementSpec = {
      tag: 'g',
      attrs: {
        fill: 'none',
        stroke: BLACK,
        'stroke-width': fmt(weight),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      children: nodes.flatMap((n) => asPath(n) ?? []),
    };
    const markup = buildElement({
      tag: 'svg',
      attrs: { viewBox: `0 0 ${SIZE} ${SIZE}`, width: String(SIZE), height: String(SIZE) },
      children: [group],
    });
    return { width: SIZE, height: SIZE, markup, group };
  }
}
