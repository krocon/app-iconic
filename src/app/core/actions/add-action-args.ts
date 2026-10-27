import { ArgSpec, ArgsSpec } from './action-args';

/**
 * Serialisable arguments of the "Add" actions (design 008 E6, AI rule): the AI calls
 * `add.circle { cx, cy, r, fill }` like a menu click. Every value is optional – missing ones take
 * the defaults (`features/commands/element-defaults.ts`). Geometry is written as given, in the
 * user space of the parent (design 008 E3). Here only the schema (core may not import features);
 * `features/commands/add-args.ts` applies the values.
 */

export type ShapeKind =
  'container' | 'circle' | 'ellipse' | 'rect' | 'path' | 'line' | 'polyline' | 'polygon' | 'text';

/** `insertNode` markup limit (`MAX_NODE_MARKUP`) and asset limit (`MAX_MARKUP`) of the registry. */
const NODE_MARKUP = 32 << 20;
const MARKUP = 16 << 20;

const COORD: ArgSpec = { type: 'number', minimum: -100_000, maximum: 100_000 };
const LENGTH: ArgSpec = { type: 'number', minimum: 0, maximum: 100_000 };
const TEXT: ArgSpec = { type: 'string', maxLength: 4096 };
const LIST: ArgSpec = { type: 'string', maxLength: 1 << 20 };

/** Where to insert (`parent` = NodeRef) – every add action has it. */
export const PLACE: Record<string, ArgSpec> = {
  parent: { type: 'json' },
  index: { type: 'integer', minimum: 0, maximum: 1_000_000 },
};

/** Paint and free attributes of every shape. */
export const PAINT: Record<string, ArgSpec> = {
  fill: TEXT,
  stroke: TEXT,
  strokeWidth: LENGTH,
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  transform: TEXT,
  id: { type: 'string', maxLength: 255 },
  /** `{ name: value }` – any further attribute (no handlers, no internal ones). */
  attributes: { type: 'json' },
};

/** Geometry arguments per shape (argument name = attribute name, except the text ones). */
export const GEOMETRY: Record<ShapeKind, Record<string, ArgSpec>> = {
  container: {},
  circle: { cx: COORD, cy: COORD, r: LENGTH },
  ellipse: { cx: COORD, cy: COORD, rx: LENGTH, ry: LENGTH },
  rect: { x: COORD, y: COORD, width: LENGTH, height: LENGTH, rx: LENGTH, ry: LENGTH },
  path: { d: LIST },
  line: { x1: COORD, y1: COORD, x2: COORD, y2: COORD },
  polyline: { points: LIST },
  polygon: { points: LIST },
  text: {
    x: COORD,
    y: COORD,
    text: TEXT,
    fontSize: LENGTH,
    fontFamily: TEXT,
    fontWeight: { type: 'string', maxLength: 32 },
  },
};

export const RENAMED: Record<string, string> = {
  strokeWidth: 'stroke-width',
  fontSize: 'font-size',
  fontFamily: 'font-family',
  fontWeight: 'font-weight',
};

export function shapeArgsSpec(kind: ShapeKind): ArgsSpec {
  return {
    type: 'object',
    properties: { ...GEOMETRY[kind], ...(kind === 'container' ? {} : PAINT), ...PLACE },
  };
}

export const IMAGE_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** A `data:image/…` URL; without it the file dialog opens. */
    href: { type: 'string', maxLength: NODE_MARKUP - 4096 },
    x: COORD,
    y: COORD,
    width: LENGTH,
    height: LENGTH,
    ...PLACE,
  },
};

export const SNIPPET_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** SVG markup; without it the dialog opens. */
    markup: { type: 'string', maxLength: MARKUP },
    ...PLACE,
  },
};
