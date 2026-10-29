import { ExportAppearance, PNG_SIZES, PngSize } from '../../core/export/export.models';
import { MaskShape } from '../canvas/canvas-view.store';

/**
 * What an export writes (design 012 E14–E16): the dialog edits it, the actions take it as
 * serialisable arguments (AI rule). Pure.
 */

export type ExportFormat = 'svg' | 'png';
export const MASKS: readonly MaskShape[] = ['none', 'squircle', 'circle'];
export const APPEARANCES: readonly ExportAppearance[] = ['light', 'dark'];

export interface ExportChoice {
  format: ExportFormat;
  appearances: ExportAppearance[];
  /** PNG only. */
  sizes: PngSize[];
  mask: MaskShape;
  effects: boolean;
  /** Keep the dimensions (prompt 048); not kept in the settings. */
  dimensions: boolean;
  /** Opaque path of the target folder; `null` = not chosen yet. */
  targetDir: string | null;
}

export const DEFAULT_CHOICE: ExportChoice = {
  format: 'png',
  appearances: ['light', 'dark'],
  sizes: [1024],
  mask: 'none',
  effects: false,
  dimensions: false,
  targetDir: null,
};

export { EXPORT_ARGS } from '../../core/actions/export-action-args';

export interface ExportRequest extends ExportChoice {
  overwrite: boolean;
}

function list<T>(v: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => allowed.includes(x as T))) return null;
  // in the order of `allowed` (largest size first, light before dark), without duplicates
  return allowed.filter((a) => v.includes(a));
}

/**
 * Action arguments (already checked against `EXPORT_ARGS`) on top of `base`; `null` if a list is
 * not valid (unknown appearance or size, empty).
 */
export function exportRequest(
  format: ExportFormat,
  args: Record<string, unknown>,
  base: ExportChoice,
): ExportRequest | null {
  const appearances =
    args['appearances'] === undefined ? base.appearances : list(args['appearances'], APPEARANCES);
  const sizes = args['sizes'] === undefined ? base.sizes : list(args['sizes'], PNG_SIZES);
  if (!appearances || !sizes) return null;
  return {
    format,
    appearances,
    sizes,
    mask: (args['mask'] as MaskShape | undefined) ?? base.mask,
    effects: (args['effects'] as boolean | undefined) ?? base.effects,
    dimensions: (args['dimensions'] as boolean | undefined) ?? base.dimensions,
    targetDir: (args['targetDir'] as string | undefined) ?? base.targetDir,
    overwrite: (args['overwrite'] as boolean | undefined) ?? false,
  };
}

/** The choice can be exported (something to write). */
export function choiceReady(c: ExportChoice): boolean {
  return c.appearances.length > 0 && (c.format === 'svg' || c.sizes.length > 0);
}

/** File name stem of a document: its name without `.icon`, else "Untitled". */
export function fileBaseName(docName: string | null, untitled: string): string {
  const base = (docName ?? '').replace(/\.icon$/i, '').trim();
  return base || untitled;
}

/** Number of files an export writes. */
export function fileCount(c: ExportChoice): number {
  return c.appearances.length * (c.format === 'png' ? c.sizes.length : 1);
}
