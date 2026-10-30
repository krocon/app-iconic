import { ArgsSpec } from './action-args';

/**
 * Arguments of `file.exportSvg` / `file.exportPng` (design 012 E14, AI rule). Lists as `json`,
 * checked further by `exportRequest()` (`features/export/export-options.ts`).
 */
export const EXPORT_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** A subset of `["light", "dark", "tinted"]`. */
    appearances: { type: 'json' },
    /** Tint of `tinted` as `#rrggbb` (prompt 077 E2); default the canvas tint. */
    tint: { type: 'string' },
    /** PNG: a subset of 1024, 512, 256, 128, 64, 32, 16. */
    sizes: { type: 'json' },
    mask: { type: 'string', enum: ['none', 'squircle', 'circle'] },
    effects: { type: 'boolean' },
    /** Keep the dimensions (default: left out). */
    dimensions: { type: 'boolean' },
    targetDir: { type: 'string' },
    overwrite: { type: 'boolean' },
  },
};
