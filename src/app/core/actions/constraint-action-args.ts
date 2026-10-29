import { ArgsSpec } from './action-args';

const TYPES = [
  'coincident',
  'horizontal',
  'vertical',
  'parallel',
  'perpendicular',
  'tangent',
  'equal',
  'concentric',
  'midpoint',
  'symmetric',
  'fix',
  'distance',
  'length',
  'radius',
  'diameter',
  'angle',
] as const;

/** Arguments of the constraint actions (prompt 059). */
export const CONSTRAINT_TOOL_ARGS: ArgsSpec = {
  type: 'object',
  properties: { type: { type: 'string', enum: TYPES } },
};

export const CONSTRAINT_ADD_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: TYPES },
    /** `[{ node: { asset, id }, part }]` – one to three entities of one asset. */
    refs: { type: 'json' },
    /** Dimensions: the value (document units, angle in degrees); default: the current one. */
    value: { type: 'number' },
  },
  required: ['type', 'refs'],
};
