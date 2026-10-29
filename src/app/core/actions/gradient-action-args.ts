import { ArgSpec, ArgsSpec } from './action-args';

/** Arguments of the gradient actions (prompt 032); `paint` picks fill or stroke of the selection. */
const PAINT: ArgSpec = { type: 'string', enum: ['fill', 'stroke'] };
const KIND: ArgSpec = { type: 'string', enum: ['linear', 'radial'] };
const COLOR: ArgSpec = { type: 'string', maxLength: 64 };

export const GRADIENT_CREATE_ARGS: ArgsSpec = {
  type: 'object',
  properties: { kind: KIND, paint: PAINT },
};

export const GRADIENT_SET_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    paint: PAINT,
    kind: KIND,
    /** Attributes of the gradient element, `null` removes one (x1…, cx…, gradientUnits, …). */
    attributes: { type: 'json' },
  },
};

export const GRADIENT_ADD_STOP_ARGS: ArgsSpec = {
  type: 'object',
  properties: { offset: { type: 'number', minimum: 0, maximum: 1 }, color: COLOR, paint: PAINT },
  required: ['offset'],
};

export const GRADIENT_SET_STOP_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    index: { type: 'integer', minimum: 0 },
    offset: { type: 'number' },
    color: COLOR,
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    paint: PAINT,
  },
  required: ['index'],
};

export const GRADIENT_REMOVE_STOP_ARGS: ArgsSpec = {
  type: 'object',
  properties: { index: { type: 'integer', minimum: 0 }, paint: PAINT },
  required: ['index'],
};

export const GRADIENT_PAINT_ARGS: ArgsSpec = { type: 'object', properties: { paint: PAINT } };
