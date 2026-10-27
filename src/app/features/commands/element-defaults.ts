import { fmt } from '../../shared/geometry/align';
import { Point } from '../../shared/geometry/view-transform';
import { SVG_NS } from '../document/svg/node-ids';

/**
 * Default geometry of the "Add" commands (design 008 E5; legacy §8 `AppModel.add*`, Marc
 * Kronberg): every shape centred on `c` (the visible centre in the target's user space), black.
 * Pure – the markup is built with an inert XML document, never by gluing strings.
 */
export type { ShapeKind } from '../../core/actions/add-action-args';
import { ShapeKind } from '../../core/actions/add-action-args';

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'container',
  'circle',
  'ellipse',
  'rect',
  'path',
  'line',
  'polyline',
  'polygon',
  'text',
];

export const BLACK = '#000000';
/** Instead of a fixed "SF Pro" (legacy): the system font on every OS (prompt 008). */
export const TEXT_FONT = "system-ui, -apple-system, 'SF Pro', sans-serif";
export const TEXT_SIZE = 160;
/** Baseline below the centre so that the text stands around it (≈ 0.35 em, design 008 E5). */
export const TEXT_BASELINE = 0.35;

export interface ElementSpec {
  tag: string;
  attrs: Record<string, string>;
  text?: string;
  /** Child elements (a symbol's group, design 013 E19). */
  children?: ElementSpec[];
}

const pts = (ps: readonly [number, number][]) =>
  ps.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');

/** A thin black line without fill – the paint of new shapes (design 019 E13). */
export const THIN_LINE_ATTRS: Readonly<Record<string, string>> = {
  fill: 'none',
  stroke: BLACK,
  'stroke-width': '1',
};

/**
 * Tag, attributes and text of a shape with the legacy geometry around `c` (design 008 E5) and the
 * paint `paint` – the remembered style of its kind (design 019 E13), a thin line by default.
 */
export function defaultShape(
  kind: ShapeKind,
  c: Point,
  paint: Readonly<Record<string, string>> = THIN_LINE_ATTRS,
): ElementSpec {
  const { x, y } = c;
  switch (kind) {
    case 'container':
      return { tag: 'g', attrs: {} };
    case 'circle':
      return { tag: 'circle', attrs: { cx: fmt(x), cy: fmt(y), r: '128', ...paint } };
    case 'ellipse':
      return {
        tag: 'ellipse',
        attrs: { cx: fmt(x), cy: fmt(y), rx: '160', ry: '120', ...paint },
      };
    case 'rect':
      return {
        tag: 'rect',
        attrs: { x: fmt(x - 128), y: fmt(y - 128), width: '256', height: '256', ...paint },
      };
    case 'path':
      return {
        tag: 'path',
        attrs: {
          d: `M ${fmt(x)},${fmt(y - 140)} L ${fmt(x - 140)},${fmt(y + 140)} L ${fmt(x + 140)},${fmt(y + 140)} Z`,
          ...paint,
        },
      };
    case 'line':
      return {
        tag: 'line',
        attrs: { x1: fmt(x - 160), y1: fmt(y), x2: fmt(x + 160), y2: fmt(y), ...paint },
      };
    case 'polyline':
      return {
        tag: 'polyline',
        attrs: {
          points: pts([
            [x - 160, y + 120],
            [x, y - 140],
            [x + 160, y + 120],
          ]),
          ...paint,
        },
      };
    case 'polygon':
      return {
        tag: 'polygon',
        attrs: {
          points: pts([
            [x, y - 160],
            [x - 160, y + 120],
            [x + 160, y + 120],
          ]),
          ...paint,
        },
      };
    case 'text':
      return {
        tag: 'text',
        attrs: {
          x: fmt(x),
          y: fmt(y + TEXT_SIZE * TEXT_BASELINE),
          'font-family': TEXT_FONT,
          'font-size': String(TEXT_SIZE),
          'font-weight': '400',
          'text-anchor': 'middle',
          fill: BLACK,
        },
        text: 'Text',
      };
  }
}

/** Natural image size fitted into `max` × `max` – only made smaller (design 008 E8). */
export function fitImage(
  width: number,
  height: number,
  max = 512,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max, height: max };
  const s = Math.min(1, max / Math.max(width, height));
  return { width: width * s, height: height * s };
}

/** An `<image>` of `w` × `h` centred on `c`. */
export function imageSpec(href: string, c: Point, w: number, h: number): ElementSpec {
  return {
    tag: 'image',
    attrs: {
      x: fmt(c.x - w / 2),
      y: fmt(c.y - h / 2),
      width: fmt(w),
      height: fmt(h),
      href,
    },
  };
}

/** Markup of one SVG element (inert XML document – nothing runs, values are escaped). */
export function buildElement(spec: ElementSpec): string {
  const doc = document.implementation.createDocument(SVG_NS, 'svg', null);
  const make = (s: ElementSpec): Element => {
    const el = doc.createElementNS(SVG_NS, s.tag);
    for (const [k, v] of Object.entries(s.attrs)) {
      if (k.startsWith('xlink:')) el.setAttributeNS('http://www.w3.org/1999/xlink', k, v);
      else el.setAttribute(k, v);
    }
    if (s.text !== undefined) el.textContent = s.text;
    for (const c of s.children ?? []) el.appendChild(make(c));
    return el;
  };
  return new XMLSerializer().serializeToString(make(spec));
}
