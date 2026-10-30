import { ArgsSpec } from './action-args';

/**
 * Arguments of `file.exportSvg` / `file.exportPng` (design 012 E14, AI rule) and of the package
 * exports `file.exportAppIconSet` / `file.exportIcns` / `file.exportIco` (prompt 078). Lists as `json`,
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
    /** `appiconset`: a subset of `["ios", "macos", "watchos"]` (prompt 078). */
    platforms: { type: 'json' },
  },
};

/** `file.copyPng` (prompt 078): size of the PNG (default 1024), appearance (default the canvas's). */
export const COPY_PNG_ARGS: ArgsSpec = {
  type: 'object',
  properties: {
    /** One of 1024, 512, 256, 128, 64, 32, 16 (checked by the service). */
    size: { type: 'integer', minimum: 16, maximum: 1024 },
    appearance: { type: 'string', enum: ['light', 'dark', 'tinted'] },
  },
};
