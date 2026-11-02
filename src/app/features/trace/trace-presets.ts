import { ArgsSpec } from '../../core/actions/action-args';
import { TraceOptions } from '../../core/trace/trace.models';

/**
 * Presets of "Trace Image" (prompt 087 E4): stage B "as by hand" (shapes, gradients, equal
 * sizes), stage A in detail, flat with few colours, pixel art with exact steps, black and white.
 * Pure.
 */
export type TracePreset = 'shapes' | 'detail' | 'flat' | 'pixel' | 'mono';

export const TRACE_PRESET_IDS: readonly TracePreset[] = [
  'shapes',
  'detail',
  'flat',
  'pixel',
  'mono',
];

/** Rust's defaults (vtracer's) – the base every preset changes. */
export const TRACE_DEFAULTS: TraceOptions = {
  mode: 'color',
  curves: 'spline',
  colorPrecision: 6,
  layerDifference: 16,
  speckle: 4,
  cornerThreshold: 60,
  lengthThreshold: 4,
  spliceThreshold: 45,
  threshold: 128,
  shapes: false,
  gradients: false,
  harmonize: false,
  dropBackground: false,
  scale: 1,
};

export const TRACE_PRESETS: Record<TracePreset, Partial<TraceOptions>> = {
  shapes: { shapes: true, gradients: true, harmonize: true },
  detail: {},
  flat: { colorPrecision: 4, layerDifference: 40, speckle: 10, harmonize: true },
  pixel: { curves: 'pixel', colorPrecision: 8, layerDifference: 8, speckle: 0 },
  mono: { mode: 'mono', speckle: 4 },
};

/** The options the user can change in the dialog (and the AI as arguments). */
export type TraceOverrides = Partial<
  Pick<
    TraceOptions,
    | 'curves'
    | 'colorPrecision'
    | 'layerDifference'
    | 'speckle'
    | 'threshold'
    | 'shapes'
    | 'gradients'
    | 'harmonize'
    | 'dropBackground'
  >
>;

export const OVERRIDE_KEYS = [
  'curves',
  'colorPrecision',
  'layerDifference',
  'speckle',
  'threshold',
  'shapes',
  'gradients',
  'harmonize',
  'dropBackground',
] as const satisfies readonly (keyof TraceOverrides)[];

/** Defaults, then the preset, then what the user changed, then the scale of the source. */
export function traceOptions(
  preset: TracePreset,
  overrides: TraceOverrides,
  scale: number,
): TraceOptions {
  return { ...TRACE_DEFAULTS, ...TRACE_PRESETS[preset], ...overrides, scale };
}

/** The overrides among `args` (checked by the action's spec before). */
export function overridesOf(args: Record<string, unknown>): TraceOverrides {
  const out: Record<string, unknown> = {};
  for (const k of OVERRIDE_KEYS) if (args[k] !== undefined) out[k] = args[k];
  return out as TraceOverrides;
}

/** Where the image comes from. */
export type TraceSourceKind = 'layer' | 'template' | 'clipboard' | 'file';
export const TRACE_SOURCES: readonly TraceSourceKind[] = ['layer', 'template', 'clipboard', 'file'];

/** Arguments of `trace.image` (with them it traces without the dialog – AI, tests). */
export const TRACE_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    source: { type: 'string', enum: TRACE_SOURCES },
    preset: { type: 'string', enum: TRACE_PRESET_IDS },
    curves: { type: 'string', enum: ['spline', 'polygon', 'pixel'] },
    colorPrecision: { type: 'integer', minimum: 1, maximum: 8 },
    layerDifference: { type: 'integer', minimum: 0, maximum: 255 },
    speckle: { type: 'integer', minimum: 0, maximum: 128 },
    threshold: { type: 'integer', minimum: 0, maximum: 255 },
    shapes: { type: 'boolean' },
    gradients: { type: 'boolean' },
    harmonize: { type: 'boolean' },
    dropBackground: { type: 'boolean' },
  },
};
