import { ExportAppearance, PackageKind } from '../../core/export/export.models';
import { MaskShape } from '../canvas/canvas-view.store';
import type { ExportChoice, ExportFormat } from './export-options';

/**
 * Package exports (design 078 E1): which package a choice exports and which SVG sources it needs.
 * Rust (`export::package`) plans the files and renders the sources; this table says how each
 * source is built (appearance, mask, frame, tint). Pure.
 *
 * A new package kind (079: Android, Web) = a `PackageFormat`, a `PackageKind` variant on both
 * sides, its sources here and its file names in `packageFiles` (the mirror of the Rust plan).
 */

export type PackageFormat = 'appiconset' | 'icns' | 'ico';
export const PACKAGE_FORMATS: readonly PackageFormat[] = ['appiconset', 'icns', 'ico'];

export type AppIconPlatform = 'ios' | 'macos' | 'watchos';
export const PLATFORMS: readonly AppIconPlatform[] = ['ios', 'macos', 'watchos'];

/** Source ids (Rust `export::package::source`). */
export const PACKAGE_SOURCE = {
  iosLight: 'ios-light',
  iosDark: 'ios-dark',
  iosTinted: 'ios-tinted',
  macos: 'macos',
  watchos: 'watchos',
  windows: 'windows',
} as const;

/** Apple wants the tinted icon as greyscale – the system tints it (design 078 E3). */
export const GREY_TINT = '#ffffff';

/** How the frontend builds one source (`exportSvg` options). */
export interface PackageSourceSpec {
  id: string;
  appearance: ExportAppearance;
  mask: MaskShape;
  frame: 'macos' | null;
  tint: string;
}

export function isPackage(f: ExportFormat): f is PackageFormat {
  return (PACKAGE_FORMATS as readonly string[]).includes(f);
}

/** The package of a choice; `null` for loose SVG/PNG files or an icon set without platform. */
export function packageKind(c: ExportChoice): PackageKind | null {
  switch (c.format) {
    case 'appiconset':
      if (!c.platforms.length) return null;
      return {
        kind: 'appIconSet',
        ios: c.platforms.includes('ios'),
        appearances: c.appearances.filter((a) => a !== 'light'),
        macos: c.platforms.includes('macos'),
        watchos: c.platforms.includes('watchos'),
      };
    case 'icns':
      return { kind: 'icns' };
    case 'ico':
      return { kind: 'ico' };
    default:
      return null;
  }
}

const spec = (
  id: string,
  appearance: ExportAppearance,
  mask: MaskShape = 'none',
  frame: 'macos' | null = null,
): PackageSourceSpec => ({ id, appearance, mask, frame, tint: GREY_TINT });

/** The sources a package needs, in the order Rust expects none (ids are matched). */
export function packageSources(kind: PackageKind, c: ExportChoice): PackageSourceSpec[] {
  switch (kind.kind) {
    case 'appIconSet': {
      const out: PackageSourceSpec[] = [];
      if (kind.ios) {
        out.push(spec(PACKAGE_SOURCE.iosLight, 'light'));
        if (kind.appearances.includes('dark')) out.push(spec(PACKAGE_SOURCE.iosDark, 'dark'));
        if (kind.appearances.includes('tinted')) out.push(spec(PACKAGE_SOURCE.iosTinted, 'tinted'));
      }
      if (kind.macos) out.push(spec(PACKAGE_SOURCE.macos, 'light', 'none', 'macos'));
      if (kind.watchos) out.push(spec(PACKAGE_SOURCE.watchos, 'light'));
      return out;
    }
    case 'icns':
      return [spec(PACKAGE_SOURCE.macos, 'light', 'none', 'macos')];
    case 'ico':
      return [spec(PACKAGE_SOURCE.windows, 'light', c.mask)];
  }
}

/** macOS sizes in points, each @1x and @2x (Rust `appiconset::MAC_POINTS`). */
export const MAC_POINTS = [16, 32, 128, 256, 512] as const;

/** The files Rust writes for `kind` (mirror of the Rust plan; the fake and the file count use it). */
export function packageFiles(
  kind: PackageKind,
  base: string,
): { folder: string | null; files: string[] } {
  switch (kind.kind) {
    case 'appIconSet': {
      const files = ['Contents.json'];
      if (kind.ios) {
        files.push('ios-1024.png');
        for (const a of ['dark', 'tinted'] as const)
          if (kind.appearances.includes(a)) files.push(`ios-1024-${a}.png`);
      }
      if (kind.macos)
        for (const pt of MAC_POINTS)
          for (const s of [1, 2]) files.push(`mac-${pt}x${pt}@${s}x.png`);
      if (kind.watchos) files.push('watchos-1024.png');
      return { folder: 'AppIcon.appiconset', files };
    }
    case 'icns':
      return { folder: null, files: [`${base}.icns`] };
    case 'ico':
      return { folder: null, files: [`${base}.ico`] };
  }
}
