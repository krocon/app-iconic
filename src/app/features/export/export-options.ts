import { ExportAppearance, PNG_SIZES, PngSize } from '../../core/export/export.models';
import { MaskShape } from '../canvas/canvas-view.store';
import { DEFAULT_TINT, parseTint } from '../canvas/tinted';
import {
  AppIconPlatform,
  isPackage,
  PackageFormat,
  packageFiles,
  packageKind,
  PLATFORMS,
} from './export-packages';
import { parseGroupIndexes } from './export-android-web';

/**
 * What an export writes (design 012 E14–E16): the dialog edits it, the actions take it as
 * serialisable arguments (AI rule). Pure.
 */

/** Loose files (012) or a package (078: Xcode icon set, `.icns`, `.ico`). */
export type ExportFormat = 'svg' | 'png' | PackageFormat;
export const FORMATS: readonly ExportFormat[] = [
  'png',
  'svg',
  'appiconset',
  'icns',
  'ico',
  'android',
  'web',
];
export const MASKS: readonly MaskShape[] = ['none', 'squircle', 'circle'];
/** In this order (file order, Rust `APPEARANCES`); `tinted` since prompt 077. */
export const APPEARANCES: readonly ExportAppearance[] = ['light', 'dark', 'tinted'];

export interface ExportChoice {
  format: ExportFormat;
  appearances: ExportAppearance[];
  /** PNG only. */
  sizes: PngSize[];
  mask: MaskShape;
  effects: boolean;
  /** Keep the dimensions (prompt 048); not kept in the settings. */
  dimensions: boolean;
  /** Tint of the `tinted` variant (`#rrggbb`, prompt 077 E2) – a view setting, not the document. */
  tint: string;
  /** Opaque path of the target folder; `null` = not chosen yet. */
  targetDir: string | null;
  /** `appiconset` only: the platforms of the icon set (prompt 078). */
  platforms: AppIconPlatform[];
  /** `android` only: also the monochrome layer for themed icons (prompt 079). */
  monochrome: boolean;
  /**
   * `android` only: icon.json group indexes on the background layer (079 E4); the others are the
   * foreground. Belongs to one document – not kept in the settings.
   */
  backgroundGroups: number[];
}

export const DEFAULT_CHOICE: ExportChoice = {
  format: 'png',
  appearances: ['light', 'dark'],
  sizes: [1024],
  mask: 'none',
  effects: false,
  dimensions: false,
  tint: DEFAULT_TINT,
  targetDir: null,
  platforms: ['ios', 'macos'],
  monochrome: true,
  backgroundGroups: [],
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
 * not valid (unknown appearance or size, empty) or the tint is not `#rrggbb`.
 */
export function exportRequest(
  format: ExportFormat,
  args: Record<string, unknown>,
  base: ExportChoice,
): ExportRequest | null {
  const appearances =
    args['appearances'] === undefined ? base.appearances : list(args['appearances'], APPEARANCES);
  const sizes = args['sizes'] === undefined ? base.sizes : list(args['sizes'], PNG_SIZES);
  const tint = args['tint'] === undefined ? base.tint : parseTint(args['tint']);
  const platforms =
    args['platforms'] === undefined ? base.platforms : list(args['platforms'], PLATFORMS);
  const backgroundGroups =
    args['backgroundGroups'] === undefined
      ? base.backgroundGroups
      : parseGroupIndexes(args['backgroundGroups']);
  if (!appearances || !sizes || !tint || !platforms || !backgroundGroups) return null;
  return {
    format,
    appearances,
    sizes,
    mask: (args['mask'] as MaskShape | undefined) ?? base.mask,
    effects: (args['effects'] as boolean | undefined) ?? base.effects,
    dimensions: (args['dimensions'] as boolean | undefined) ?? base.dimensions,
    tint,
    targetDir: (args['targetDir'] as string | undefined) ?? base.targetDir,
    platforms,
    monochrome: (args['monochrome'] as boolean | undefined) ?? base.monochrome,
    backgroundGroups,
    overwrite: (args['overwrite'] as boolean | undefined) ?? false,
  };
}

/** The choice can be exported (something to write). */
export function choiceReady(c: ExportChoice): boolean {
  if (c.format === 'appiconset') return c.platforms.length > 0;
  if (isPackage(c.format)) return true;
  return c.appearances.length > 0 && (c.format === 'svg' || c.sizes.length > 0);
}

/** File name stem of a document: its name without `.icon`, else "Untitled". */
export function fileBaseName(docName: string | null, untitled: string): string {
  const base = (docName ?? '').replace(/\.icon$/i, '').trim();
  return base || untitled;
}

/** Number of files an export writes. */
export function fileCount(c: ExportChoice): number {
  const kind = packageKind(c);
  if (kind) return packageFiles(kind, 'x').files.length;
  if (isPackage(c.format)) return 0;
  return c.appearances.length * (c.format === 'png' ? c.sizes.length : 1);
}

/** One file set of an export: the appearance and the tint it is rendered with (prompt 077 E7). */
export interface ExportVariantSpec {
  appearance: ExportAppearance;
  /** Only used by `tinted`; carried for every variant so callers (078, 079) need no second source. */
  tint: string;
}

/** The variants an export renders, in file order (light, dark, tinted). */
export function exportVariants(c: ExportChoice): ExportVariantSpec[] {
  return APPEARANCES.filter((a) => c.appearances.includes(a)).map((appearance) => ({
    appearance,
    tint: parseTint(c.tint) ?? DEFAULT_TINT,
  }));
}

/** File name as Rust writes it (`export/files.rs`): `<base>-<appearance>[-<size>].<ext>`. */
export function exportFileName(base: string, appearance: ExportAppearance, size?: number): string {
  return size === undefined ? `${base}-${appearance}.svg` : `${base}-${appearance}-${size}.png`;
}
