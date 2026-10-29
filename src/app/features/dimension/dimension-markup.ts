import {
  angleDimension,
  arcPath,
  DimensionShape,
  linearDimension,
  radialDimension,
} from '../../shared/geometry/dimension';
import { Point } from '../../shared/geometry/view-transform';
import { ElementSpec } from '../commands/element-defaults';

/**
 * What a dimension measures (prompt 048), serialisable (the AI's `dimension.add`): document units.
 */
export type DimensionInput =
  | { kind: 'linear'; a: Point; b: Point; at: Point }
  | { kind: 'radius' | 'diameter'; c: Point; r: number; at: Point }
  | { kind: 'angle'; v: Point; p1: Point; p2: Point; at: Point };

/** The attribute that marks a dimension (kept in the file; the export leaves them out by default). */
export const DIMENSION_ATTR = 'data-dimension';
/** Look of the dimensions (document units at 100 %). */
export const DIMENSION_COLOR = '#e6007e';
export const DIMENSION_STROKE = 1.5;
export const DIMENSION_FONT = 18;
const TIP = 8;
const GAP = 6;

/** The shape of a dimension; `map` and `scale` place it in another space (the value stays). */
export function dimensionShape(
  input: DimensionInput,
  map: (p: Point) => Point = (p) => p,
  scale = 1,
): DimensionShape | null {
  switch (input.kind) {
    case 'linear':
      return linearDimension(map(input.a), map(input.b), map(input.at), GAP * scale);
    case 'radius':
    case 'diameter':
      return radialDimension(
        map(input.c),
        input.r * scale,
        map(input.at),
        input.kind === 'diameter',
      );
    case 'angle':
      return angleDimension(map(input.v), map(input.p1), map(input.p2), map(input.at));
  }
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/** The path data of the lines, the arc and the arrow tips. */
export function dimensionPath(s: DimensionShape, tip: number): string {
  const parts = s.lines.map(([a, b]) => `M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}`);
  if (s.arc) parts.push(arcPath(s.arc));
  for (const t of s.tips) {
    // an open arrow head pointing along `dir`
    const back = { x: -t.dir.x * tip, y: -t.dir.y * tip };
    const side = { x: -t.dir.y * tip * 0.45, y: t.dir.x * tip * 0.45 };
    const p1 = { x: t.at.x + back.x + side.x, y: t.at.y + back.y + side.y };
    const p2 = { x: t.at.x + back.x - side.x, y: t.at.y + back.y - side.y };
    parts.push(`M ${n(p1.x)} ${n(p1.y)} L ${n(t.at.x)} ${n(t.at.y)} L ${n(p2.x)} ${n(p2.y)}`);
  }
  return parts.join(' ');
}

/**
 * The dimension as one `<g data-dimension>` in the space `map` leads to (`scale` = its units per
 * document unit): the label shows the value in document units.
 */
export function dimensionSpec(
  input: DimensionInput,
  map: (p: Point) => Point = (p) => p,
  scale = 1,
): ElementSpec | null {
  const value = dimensionShape(input);
  const s = dimensionShape(input, map, scale);
  if (!value || !s) return null;
  const font = DIMENSION_FONT * scale;
  return {
    tag: 'g',
    attrs: { [DIMENSION_ATTR]: input.kind, 'data-value': n(value.value) },
    children: [
      {
        tag: 'path',
        attrs: {
          d: dimensionPath(s, TIP * scale),
          fill: 'none',
          stroke: DIMENSION_COLOR,
          'stroke-width': n(DIMENSION_STROKE * scale),
          'stroke-linecap': 'round',
        },
      },
      {
        tag: 'text',
        attrs: {
          x: n(s.label.x),
          y: n(s.label.y),
          dy: n(-GAP * scale),
          transform: `rotate(${n(s.rotate)} ${n(s.label.x)} ${n(s.label.y)})`,
          'text-anchor': 'middle',
          'font-family': 'sans-serif',
          'font-size': n(font),
          fill: DIMENSION_COLOR,
        },
        text: value.text,
      },
    ],
  };
}
