import { parsePath, PathSeg } from '../../../shared/geometry/path-data';
import { Point } from '../../../shared/geometry/view-transform';

/**
 * What the point handles of a node work on (design 007 E6): a snapshot of its geometry
 * attributes, read once when a gesture starts. Lengths come from the SVG DOM (`baseVal`: units
 * resolved by the browser) where it has them; the edit maths (`node-handles.ts`,
 * `handle-edit.ts`) is pure on top of this.
 */
export type NodeGeometry =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
      ry: number;
      hasRy: boolean;
    }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'poly'; points: Point[]; closed: boolean }
  | { kind: 'path'; segs: PathSeg[] }
  | { kind: 'text'; xs: number[]; ys: number[]; anchor: TextAnchor }
  /** Groups, `use`, `image`, unparsable data …: box handles only (design 007 E7). */
  | { kind: 'box' };

export type TextAnchor = 'start' | 'middle' | 'end';

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** All numbers of a list attribute (`points`, `x="1 2 3"`). */
export function numberList(s: string | null): number[] {
  return (s?.match(NUM) ?? []).map(Number);
}

export function pointList(s: string | null): Point[] {
  const n = numberList(s);
  const out: Point[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

/** A length attribute in user units: the animated base value (units resolved), else the number. */
function length(el: Element, name: string, fallback = 0): number {
  const v = (el as unknown as Record<string, { baseVal?: { value?: number } } | undefined>)[name];
  const dom = v?.baseVal?.value;
  if (typeof dom === 'number' && Number.isFinite(dom)) return dom;
  const n = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function textAnchor(el: Element): TextAnchor {
  const own =
    el.getAttribute('text-anchor') ?? (el as HTMLElement).style?.getPropertyValue?.('text-anchor');
  const v = own || globalThis.getComputedStyle?.(el)?.getPropertyValue('text-anchor');
  return v === 'middle' || v === 'end' ? v : 'start';
}

export function readGeometry(el: Element): NodeGeometry {
  switch (el.localName) {
    case 'rect': {
      const rxAttr = el.getAttribute('rx');
      const ryAttr = el.getAttribute('ry');
      const rx = rxAttr !== null ? length(el, 'rx') : ryAttr !== null ? length(el, 'ry') : 0;
      const ry = ryAttr !== null ? length(el, 'ry') : rx;
      return {
        kind: 'rect',
        x: length(el, 'x'),
        y: length(el, 'y'),
        width: length(el, 'width'),
        height: length(el, 'height'),
        rx,
        ry,
        hasRy: ryAttr !== null,
      };
    }
    case 'circle':
      return { kind: 'circle', cx: length(el, 'cx'), cy: length(el, 'cy'), r: length(el, 'r') };
    case 'ellipse':
      return {
        kind: 'ellipse',
        cx: length(el, 'cx'),
        cy: length(el, 'cy'),
        rx: length(el, 'rx'),
        ry: length(el, 'ry'),
      };
    case 'line':
      return {
        kind: 'line',
        x1: length(el, 'x1'),
        y1: length(el, 'y1'),
        x2: length(el, 'x2'),
        y2: length(el, 'y2'),
      };
    case 'polyline':
    case 'polygon':
      return {
        kind: 'poly',
        points: pointList(el.getAttribute('points')),
        closed: el.localName === 'polygon',
      };
    case 'path': {
      const segs = parsePath(el.getAttribute('d') ?? '');
      return segs ? { kind: 'path', segs } : { kind: 'box' };
    }
    case 'text': {
      const xs = numberList(el.getAttribute('x'));
      const ys = numberList(el.getAttribute('y'));
      return {
        kind: 'text',
        xs: xs.length ? xs : [0],
        ys: ys.length ? ys : [0],
        anchor: textAnchor(el),
      };
    }
    default:
      return { kind: 'box' };
  }
}
