import { ArgsSpec, ArgSpec } from './action-args';
import { PAINT, PLACE } from './add-action-args';

/**
 * Serialisable arguments of the tools (design 013 E7, E14, E21; AI rule): with arguments the
 * tools add directly, without them the mouse tool / dialog / picker opens. Coordinates in the user
 * space of the parent (design 008 E3). Nothing is `required`: no arguments = menu click. Only the
 * schema here (core may not import features).
 */

const COORD: ArgSpec = { type: 'number', minimum: -100_000, maximum: 100_000 };
const TEXT: ArgSpec = { type: 'string', maxLength: 4096 };

/** At most this many points per freehand stroke from outside. */
export const MAX_FREEHAND_POINTS = 100_000;

export const FREEHAND_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** `[[x, y], …]`, 2 … 100 000 points; without them the tool switches on/off. */
    points: { type: 'json' },
    closed: { type: 'boolean' },
    epsilon: { type: 'number', minimum: 0, maximum: 100 },
    ...PAINT,
    ...PLACE,
  },
};

export const TEXT_PATH_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** The text; without it the dialog opens. */
    text: { type: 'string', maxLength: 256 },
    /** Font id (`list_fonts`) or family name; default: the system's sans-serif. */
    font: { type: 'string', maxLength: 255 },
    /** Style name ("Bold Italic"); default: the one nearest to Regular. */
    style: { type: 'string', maxLength: 255 },
    size: { type: 'number', minimum: 1, maximum: 4096 },
    letterSpacing: { type: 'number', minimum: -1000, maximum: 1000 },
    /** Centre of the text. */
    x: COORD,
    y: COORD,
    fill: TEXT,
    ...PLACE,
  },
};

export const SYMBOL_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** Symbol set (`lucide`). */
    set: { type: 'string', maxLength: 64 },
    /** Symbol id (`heart`); without it the picker opens. */
    id: { type: 'string', maxLength: 128 },
    /** Width and height in document units. */
    size: { type: 'number', minimum: 1, maximum: 4096 },
    /** Stroke weight of the set (Lucide: stroke width in icon units). */
    weight: { type: 'number', minimum: 0.25, maximum: 4 },
    stroke: TEXT,
    /** Centre of the symbol. */
    x: COORD,
    y: COORD,
    ...PLACE,
  },
};
