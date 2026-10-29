import { ArgsSpec } from './action-args';
import { PAINT, PLACE } from './add-action-args';

/**
 * Serialisable arguments of the sketch tools (design 019 E14, AI rule): `points` are the clicks in
 * DOCUMENT units in the order of the tool's steps (a pick step: a point on the edge, circle or
 * line end), `values` the typed dimensions. Without arguments the action switches the mouse tool
 * on/off. Only the schema here (core may not import features).
 */

/** Most steps of a tool (3-Tangent Circle: three picks and the choice). */
export const MAX_SKETCH_POINTS = 8;

/** The dimension fields (`FieldKey` of `shared/geometry/sketch/sketch-tools.ts`). */
export const SKETCH_VALUE_KEYS = [
  'length',
  'angle',
  'width',
  'height',
  'diameter',
  'radius',
  'start',
  'sweep',
  'sides',
] as const;

/**
 * The pen / curvature tools (prompts 042, 043): without arguments the tool on/off; with
 * `anchors` (`[{ p: [x, y], in?: [x, y], out?: [x, y] }, …]`, document units) and `closed` the
 * path at once.
 */
export const PEN_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    anchors: { type: 'json' },
    closed: { type: 'boolean' },
    ...PAINT,
    ...PLACE,
  },
};

/** The curvature tool (prompt 043): `points` `[[x, y], …]`, `corners` `[bool, …]`, `closed`. */
export const CURVATURE_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    points: { type: 'json' },
    corners: { type: 'json' },
    closed: { type: 'boolean' },
    ...PAINT,
    ...PLACE,
  },
};

export const SKETCH_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** `[[x, y], …]` – one point per step of the tool. */
    points: { type: 'json' },
    /**
     * `{ length, angle, width, height, diameter, radius, start, sweep, sides }` – degrees
     * counter-clockwise; `sides` of a polygon 3 … 64 (default 6).
     * A Center Point Arc from `points` alone sweeps at most 180°; a larger one needs `sweep`.
     */
    values: { type: 'json' },
    ...PAINT,
    ...PLACE,
  },
};
