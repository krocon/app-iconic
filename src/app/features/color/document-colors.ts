import { IconDocument } from '../document/icon-document';
import {
  CompositeCommand,
  DocCommand,
  JsonValue,
  normalizeColor,
  PAINT_PROPS,
  ReplaceColor,
  SetIconJsonValue,
} from '../document/commands';
import { elementsOf } from '../document/svg/node-ids';
import { srgbHexOf, withSrgbHex } from '../inspector/icon-color-text';

/** A colour of the document and how often it is used. */
export interface DocumentColor {
  color: string;
  count: number;
}

/** Most colours listed (a hint, not an inventory). */
export const MAX_DOCUMENT_COLORS = 48;

type JsonPath = (string | number)[];

/** Every colour string of `icon.json` (`srgb:…`, `display-p3:…`, `gray:…`) with its path. */
function iconJsonColors(json: JsonValue, path: JsonPath = []): { path: JsonPath; hex: string }[] {
  if (typeof json === 'string') {
    const hex = srgbHexOf(json);
    const n = hex ? normalizeColor(hex) : null;
    return n ? [{ path, hex: n }] : [];
  }
  if (Array.isArray(json)) return json.flatMap((v, i) => iconJsonColors(v, [...path, i]));
  if (json && typeof json === 'object')
    return Object.entries(json).flatMap(([k, v]) => iconJsonColors(v, [...path, k]));
  return [];
}

/**
 * The colours of the document (prompt 074 E4), pure apart from reading the DOM: paint attributes
 * and `style` properties of every SVG asset and the colours of `icon.json` (fills, layer fills),
 * normalised to `#RRGGBB(AA)`, most used first.
 */
export function documentColors(doc: IconDocument): DocumentColor[] {
  const counts = new Map<string, number>();
  const add = (c: string | null) => {
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  for (const a of doc.assets.values()) {
    const root = a.svg?.root;
    if (!root) continue;
    for (const el of elementsOf(root)) {
      for (const p of PAINT_PROPS) add(normalizeColor(el.getAttribute(p)));
      const style = el.getAttribute('style');
      if (style) {
        for (const d of style.split(';')) {
          const [k, ...v] = d.split(':');
          if (PAINT_PROPS.includes(k.trim().toLowerCase())) add(normalizeColor(v.join(':')));
        }
      }
    }
  }
  for (const c of iconJsonColors(doc.iconJson as JsonValue)) add(c.hex);
  return [...counts]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color))
    .slice(0, MAX_DOCUMENT_COLORS);
}

/**
 * "Replace Color" in the whole icon (prompt 074 E4) as one step: `replaceColor` on the SVG assets
 * and `setIconJsonValue` for every `icon.json` colour that is `from`; `null` if nothing has it.
 */
export function replaceColorCommand(
  doc: IconDocument,
  from: string,
  to: string,
): DocCommand | null {
  const f = normalizeColor(from);
  const t = normalizeColor(to);
  if (!f || !t || f === t) return null;
  const svg = new ReplaceColor(f, t);
  const json = iconJsonColors(doc.iconJson as JsonValue)
    .filter((c) => c.hex === f)
    .flatMap((c) => {
      const raw = c.path.reduce<JsonValue>(
        (v, k) => (v as Record<string | number, JsonValue>)[k],
        doc.iconJson as JsonValue,
      );
      const next = withSrgbHex(raw, t);
      return next ? [new SetIconJsonValue(c.path, next, 'replaceColor')] : [];
    });
  const svgHas = documentColorsInSvg(doc).has(f);
  if (!svgHas && !json.length) return null;
  return new CompositeCommand('replaceColor', [...(svgHas ? [svg] : []), ...json]);
}

function documentColorsInSvg(doc: IconDocument): Set<string> {
  const out = new Set<string>();
  for (const a of doc.assets.values()) {
    const root = a.svg?.root;
    if (!root) continue;
    for (const el of elementsOf(root)) {
      for (const p of PAINT_PROPS) {
        const c = normalizeColor(el.getAttribute(p));
        if (c) out.add(c);
      }
      const style = el.getAttribute('style');
      for (const d of style?.split(';') ?? []) {
        const [k, ...v] = d.split(':');
        if (PAINT_PROPS.includes(k.trim().toLowerCase())) {
          const c = normalizeColor(v.join(':'));
          if (c) out.add(c);
        }
      }
    }
  }
  return out;
}
