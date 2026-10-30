/**
 * DTOs of the export (design 012), synchronous with Rust `ai_core::export` (serde camelCase).
 */

/** The PNG sizes the export offers (Rust `PNG_SIZES`). */
export const PNG_SIZES = [1024, 512, 256, 128, 64, 32, 16] as const;
export type PngSize = (typeof PNG_SIZES)[number];

/** `tinted`: the approximation of prompt 077 E2 (Rust `APPEARANCES`). */
export type ExportAppearance = 'light' | 'dark' | 'tinted';

/** One appearance of the icon as SVG text. */
export interface ExportVariant {
  appearance: ExportAppearance;
  svg: string;
}

export interface ExportFileOptions {
  /** File name stem (the backend cleans it). */
  baseName: string;
  /** Replace existing files – only after the user confirmed (design 012 E11). */
  overwrite: boolean;
}

export interface ExportedFile {
  name: string;
  /** Opaque path (CLAUDE.md §4). */
  path: string;
  /** PNG only: at least one pixel is not opaque (design 012 E13). */
  transparent: boolean | null;
}

export interface ExportReport {
  files: ExportedFile[];
  cancelled: boolean;
  /** Package exports with a folder (`AppIcon.appiconset`, prompt 078): its opaque path. */
  folder?: string | null;
}

/**
 * A package export (prompt 078, Rust `export::package::PackageKind`, tagged by `kind`):
 * `appIconSet` = Xcode `AppIcon.appiconset` (`appearances`: iOS variants besides the default),
 * `icns` = `<name>.icns`, `ico` = `<name>.ico`. 079 adds Android and Web.
 */
export type PackageKind =
  | {
      kind: 'appIconSet';
      ios: boolean;
      appearances: ExportAppearance[];
      macos: boolean;
      watchos: boolean;
    }
  | { kind: 'icns' }
  | { kind: 'ico' };

/** One SVG built for a package; `id` from `PACKAGE_SOURCE` (Rust `package::source`). */
export interface PackageSource {
  id: string;
  svg: string;
}

/** After every written PNG (design 012 E12). */
export interface ExportProgress {
  done: number;
  total: number;
  name: string;
}
