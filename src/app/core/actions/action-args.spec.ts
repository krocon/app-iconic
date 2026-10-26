import { ArgsSpec, checkArgs } from './action-args';

const zoom: ArgsSpec = {
  type: 'object',
  required: ['zoom'],
  properties: { zoom: { type: 'number', minimum: 0.25, maximum: 2 } },
};

describe('action arguments (design 005 E3)', () => {
  it('an action without a spec takes no arguments', () => {
    expect(checkArgs(undefined, undefined)).toBe(true);
    expect(checkArgs(undefined, {})).toBe(false);
  });

  it('checks required keys, unknown keys, types and bounds', () => {
    expect(checkArgs(zoom, { zoom: 1 })).toBe(true);
    expect(checkArgs(zoom, undefined)).toBe(false);
    expect(checkArgs(zoom, {})).toBe(false);
    expect(checkArgs(zoom, { zoom: 3 })).toBe(false);
    expect(checkArgs(zoom, { zoom: '1' })).toBe(false);
    expect(checkArgs(zoom, { zoom: NaN })).toBe(false);
    expect(checkArgs(zoom, { zoom: 1, x: 1 })).toBe(false);
    expect(checkArgs(zoom, [1])).toBe(false);
    expect(checkArgs(zoom, JSON.parse('{"__proto__": 1, "zoom": 1}'))).toBe(false);
  });

  it('knows strings with enums, integers, booleans and JSON values', () => {
    const spec: ArgsSpec = {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['a', 'b'] },
        n: { type: 'integer', minimum: 0 },
        on: { type: 'boolean' },
        any: { type: 'json' },
      },
    };
    expect(checkArgs(spec, undefined)).toBe(true);
    expect(checkArgs(spec, { mode: 'a', n: 2, on: false, any: { x: [1] } })).toBe(true);
    expect(checkArgs(spec, { mode: 'c' })).toBe(false);
    expect(checkArgs(spec, { n: 1.5 })).toBe(false);
    expect(checkArgs(spec, { n: -1 })).toBe(false);
    expect(checkArgs(spec, { on: 1 })).toBe(false);
    expect(checkArgs(spec, { mode: 'x'.repeat(5000) })).toBe(false);
  });
});
