import { ArgsSpec } from './action-args';

/**
 * Arguments of the clip path actions (design 014 E14, AI rule). Without `node` / `layer` the
 * selection is the target; `node` = a NodeRef `{ asset, id }`, `layer` = `{ group, layer }`
 * (checked by the `ClipService`).
 */
const TARGET = {
  node: { type: 'json' },
  layer: { type: 'json' },
} as const;
const CLIP = {
  clip: { type: 'string', maxLength: 255 },
  asset: { type: 'string', maxLength: 255 },
} as const;

export const CLIP_CREATE_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    ...TARGET,
    /** Start shape in the canvas rectangle (layer) or the node's bounds (default `rect`). */
    shape: { type: 'string', enum: ['rect', 'circle', 'ellipse'] },
    /** Own shape markup instead (cleaned like every insert). */
    markup: { type: 'string', maxLength: 1 << 20 },
    /** The new clip's id (default `clip`, `clip-2` …). */
    id: { type: 'string', maxLength: 255 },
  },
};

export const CLIP_ASSIGN_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    ...TARGET,
    /** Id of a `<clipPath>` of the asset … */
    clip: { type: 'string', maxLength: 255 },
    /** … or none / inherit (nodes; layers: none). */
    mode: { type: 'string', enum: ['none', 'inherit'] },
  },
};

export const CLIP_TARGET_ARGS: ArgsSpec = {
  type: 'object',
  properties: { ...TARGET, ...CLIP },
};

export const CLIP_REMOVE_ARGS: ArgsSpec = {
  type: 'object',
  properties: { ...TARGET, ...CLIP, confirm: { type: 'boolean' } },
};

export const CLIP_UNITS_ARGS: ArgsSpec = {
  type: 'object',
  required: ['units'],
  properties: {
    ...TARGET,
    ...CLIP,
    units: { type: 'string', enum: ['userSpaceOnUse', 'objectBoundingBox'] },
  },
};
