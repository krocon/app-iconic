import { ArgsSpec } from './action-args';

/**
 * Arguments of `file.exportSvg` / `file.exportPng` (design 012 E14, AI rule). Lists as `json`,
 * checked further by `exportRequest()` (`features/export/export-options.ts`).
 */
export const EXPORT_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** `["light", "dark"]` or one of them. */
    appearances: { type: 'json' },
    /** PNG: a subset of 1024, 512, 256, 128, 64, 32, 16. */
    sizes: { type: 'json' },
    mask: { type: 'string', enum: ['none', 'squircle', 'circle'] },
    effects: { type: 'boolean' },
    targetDir: { type: 'string' },
    overwrite: { type: 'boolean' },
  },
};
