import { urlId } from '../../shared/controls/color-value';

/**
 * Gradients as the editor sees them (prompt 032): a `linearGradient` / `radialGradient`, its
 * attributes with the `href` chain resolved (an attribute or the stops may come from the gradient
 * it refers to), its stops. Pure apart from reading the DOM.
 */

export type GradientKind = 'linear' | 'radial';
export type Paint = 'fill' | 'stroke';

export interface GradientStop {
  /** The `<stop>` element (may belong to a referenced gradient). */
  el: Element;
  offset: number;
  color: string;
  opacity: number;
}

export interface GradientInfo {
  el: Element;
  id: string;
  kind: GradientKind;
  /** `objectBoundingBox` (default) or `userSpaceOnUse`. */
  units: 'objectBoundingBox' | 'userSpaceOnUse';
  spread: 'pad' | 'reflect' | 'repeat';
  transform: string;
  /** Coordinates as numbers (OBB: fractions; % read as fractions). */
  coords: Record<string, number>;
  stops: GradientStop[];
  /** The stops come from another gradient (`href`). */
  inherited: boolean;
}

const KINDS: Record<string, GradientKind> = {
  linearGradient: 'linear',
  radialGradient: 'radial',
};

export const isGradient = (el: Element | null | undefined): el is Element =>
  !!el && el.localName in KINDS;

/** The gradient `el` refers to with `href` / `xlink:href` (same document). */
export function hrefTarget(el: Element): Element | null {
  const h = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  if (!h?.startsWith('#')) return null;
  const t = findById(el, h.slice(1));
  return isGradient(t) ? t : null;
}

function findById(from: Element, id: string): Element | null {
  let root: Element = from;
  while (root.parentElement) root = root.parentElement;
  return root.querySelector(`[id="${CSS.escape(id)}"]`);
}

/** `el` and the gradients it refers to, nearest first (cycles stop). */
export function chain(el: Element): Element[] {
  const out: Element[] = [];
  for (let g: Element | null = el; g && !out.includes(g) && out.length < 16; g = hrefTarget(g)) {
    out.push(g);
  }
  return out;
}

function attr(c: readonly Element[], name: string): string | null {
  for (const g of c) {
    const v = g.getAttribute(name);
    if (v !== null) return v;
  }
  return null;
}

/** A coordinate: a number, or `n%` as a fraction. */
export function coord(v: string | null, fallback: number): number {
  if (v === null || v.trim() === '') return fallback;
  const t = v.trim();
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return fallback;
  return t.endsWith('%') ? n / 100 : n;
}

/** Defaults of the coordinates (SVG 1.1). */
const DEFAULTS: Record<GradientKind, Record<string, number>> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 0 },
  radial: { cx: 0.5, cy: 0.5, r: 0.5 },
};

function stopOf(s: Element): GradientStop {
  const style = s.getAttribute('style') ?? '';
  const fromStyle = (k: string) => new RegExp(`${k}\\s*:\\s*([^;]+)`).exec(style)?.[1].trim();
  const color = fromStyle('stop-color') ?? s.getAttribute('stop-color') ?? '#000000';
  const op = parseFloat(fromStyle('stop-opacity') ?? s.getAttribute('stop-opacity') ?? '1');
  return {
    el: s,
    offset: Math.max(0, Math.min(1, coord(s.getAttribute('offset'), 0))),
    color,
    opacity: Number.isFinite(op) ? op : 1,
  };
}

export function readGradient(el: Element): GradientInfo | null {
  if (!isGradient(el)) return null;
  const c = chain(el);
  const kind = KINDS[el.localName];
  const coords: Record<string, number> = {};
  for (const [k, d] of Object.entries(DEFAULTS[kind])) coords[k] = coord(attr(c, k), d);
  if (kind === 'radial') {
    coords['fx'] = coord(attr(c, 'fx'), coords['cx']);
    coords['fy'] = coord(attr(c, 'fy'), coords['cy']);
  }
  const owner = c.find((g) => g.querySelector(':scope > stop')) ?? el;
  const units =
    attr(c, 'gradientUnits') === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox';
  const spread = attr(c, 'spreadMethod');
  return {
    el,
    id: el.getAttribute('id') ?? '',
    kind,
    units,
    spread: spread === 'reflect' || spread === 'repeat' ? spread : 'pad',
    transform: attr(c, 'gradientTransform') ?? '',
    coords,
    stops: [...owner.querySelectorAll(':scope > stop')].map(stopOf),
    inherited: owner !== el,
  };
}

/** The gradient an element paints `paint` with (`url(#id)`), or `null`. */
export function paintGradient(el: Element, paint: Paint): Element | null {
  const style = el.getAttribute('style') ?? '';
  const fromStyle = new RegExp(`(?:^|;)\\s*${paint}\\s*:\\s*([^;]+)`).exec(style)?.[1];
  const id = urlId(fromStyle ?? el.getAttribute(paint));
  if (!id) return null;
  const g = findById(el, id);
  return isGradient(g) ? g : null;
}

/** How many elements of the asset paint with gradient `id` (fill, stroke, href of other gradients). */
export function usersOf(root: Element, id: string): number {
  let n = 0;
  const ref = new RegExp(
    `url\\(\\s*['"]?#${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*\\)`,
  );
  for (const el of root.querySelectorAll('*')) {
    if (isGradient(el) && hrefTarget(el)?.getAttribute('id') === id) n++;
    for (const k of ['fill', 'stroke', 'style']) {
      const v = el.getAttribute(k);
      if (v && ref.test(v)) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** The colour at `t` between the stops (for a new stop): linear in sRGB of hex colours. */
export function colorAt(
  stops: readonly GradientStop[],
  t: number,
): { color: string; opacity: number } {
  if (!stops.length) return { color: '#000000', opacity: 1 };
  const s = [...stops].sort((a, b) => a.offset - b.offset);
  if (t <= s[0].offset) return { color: s[0].color, opacity: s[0].opacity };
  const last = s[s.length - 1];
  if (t >= last.offset) return { color: last.color, opacity: last.opacity };
  const i = s.findIndex((x) => x.offset >= t);
  const a = s[i - 1];
  const b = s[i];
  const k = (t - a.offset) / Math.max(b.offset - a.offset, 1e-9);
  const ca = hex(a.color);
  const cb = hex(b.color);
  const color =
    ca && cb
      ? '#' +
        ca
          .map((v, j) =>
            Math.round(v + (cb[j] - v) * k)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('')
      : k < 0.5
        ? a.color
        : b.color;
  return { color, opacity: Math.round((a.opacity + (b.opacity - a.opacity) * k) * 1000) / 1000 };
}

function hex(c: string): number[] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** CSS of the gradient's stops (the panel's bar). */
export function cssStops(stops: readonly GradientStop[]): string {
  const s = [...stops].sort((a, b) => a.offset - b.offset);
  if (!s.length) return 'transparent';
  const parts = s.map((x) => {
    const c = hex(x.color);
    const col = c && x.opacity < 1 ? `rgb(${c.join(' ')} / ${x.opacity})` : x.color;
    return `${col} ${Math.round(x.offset * 1000) / 10}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
