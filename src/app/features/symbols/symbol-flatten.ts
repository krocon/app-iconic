import { fmt } from '../../shared/geometry/align';
import { shapeToPath } from '../../shared/geometry/shape-path';
import { BLACK, buildElement, ElementSpec } from '../commands/element-defaults';
import { sanitizeSvg } from '../document/svg/sanitize-svg';
import { SymbolSvg } from './symbol-provider';

/**
 * An own symbol (prompt 084, design E11) from its SVG markup – cleaned by Rust, cleaned **again**
 * here with `sanitizeSvg` (defence in depth) – as the provider's `SymbolSvg`: one `<g>` with the
 * default paint and every shape as a `<path>` that carries its inherited paint, its transform
 * chain (as text: the browser composes it, no own matrix chain – CLAUDE.md §4) and the viewBox
 * origin. Groups disappear, so the picker can draw the preview with plain bindings (no
 * `innerHTML`) and the inserted symbol is one group like the other sets.
 */

/** Paint passed down to the children (the SVG presentation attributes that inherit). */
const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
] as const;

/** The attributes a flattened path may carry (also what the picker binds). */
export const PATH_ATTRS = ['d', 'transform', 'opacity', ...INHERITED] as const;

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
/** Most paths of one symbol (Rust keeps at most 4 000 elements). */
export const MAX_PATHS = 4000;

interface Context {
  transforms: string[];
  paint: Record<string, string>;
  opacity: number;
}

const colour = (v: string) => (v.trim().toLowerCase() === 'currentcolor' ? BLACK : v);

function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (!a.namespaceURI) out[a.localName] = a.value;
  }
  return out;
}

function inner(el: Element, ctx: Context): Context {
  const a = attrsOf(el);
  const paint = { ...ctx.paint };
  for (const k of INHERITED) if (a[k] !== undefined) paint[k] = colour(a[k]);
  const o = Number(a['opacity']);
  return {
    transforms: a['transform'] ? [...ctx.transforms, a['transform']] : ctx.transforms,
    paint,
    opacity: Number.isFinite(o) && a['opacity'] !== undefined ? ctx.opacity * o : ctx.opacity,
  };
}

function walk(el: Element, ctx: Context, out: ElementSpec[]): void {
  for (const child of Array.from(el.children)) {
    if (out.length >= MAX_PATHS) return;
    const tag = child.localName;
    if (tag === 'g') {
      walk(child, inner(child, ctx), out);
    } else if (SHAPES.has(tag)) {
      const d = shapeToPath(tag, attrsOf(child));
      if (!d) continue;
      const c = inner(child, ctx);
      const attrs: Record<string, string> = { d, ...c.paint };
      if (c.transforms.length) attrs['transform'] = c.transforms.join(' ');
      if (c.opacity !== 1) attrs['opacity'] = fmt(c.opacity);
      out.push({ tag: 'path', attrs });
    }
  }
}

/** The symbol of `markup`, or `null` if it is no usable SVG (no viewBox, nothing to draw). */
export function symbolFromMarkup(markup: string): SymbolSvg | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    return null;
  }
  sanitizeSvg(root);
  const vb = (root.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) return null;
  const [x, y, width, height] = vb;
  const origin = x || y ? [`translate(${fmt(-x)} ${fmt(-y)})`] : [];
  const children: ElementSpec[] = [];
  walk(root, inner(root, { transforms: origin, paint: {}, opacity: 1 }), children);
  if (!children.length) return null;
  // the default paint of SVG, explicit: the parent in the document must not shine through
  const group: ElementSpec = { tag: 'g', attrs: { fill: BLACK, stroke: 'none' }, children };
  const svg = buildElement({
    tag: 'svg',
    attrs: { viewBox: `0 0 ${fmt(width)} ${fmt(height)}` },
    children: [group],
  });
  return { width, height, markup: svg, group };
}
