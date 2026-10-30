import { ExportAppearance, PackageKind } from '../../core/export/export.models';
import { MaskShape } from '../canvas/canvas-view.store';
import type { ExportChoice, ExportFormat } from './export-options';
import {
  ANDROID_CANVAS_SCALE,
  androidFiles,
  androidLayers,
  WEB_FILES,
  WEB_MASKABLE_SCALE,
} from './export-android-web';

/**
 * Package exports (design 078 E1): which package a choice exports and which SVG sources it needs.
 * Rust (`export::package`) plans the files and renders the sources; this table says how each
 * source is built (appearance, mask, frame, tint). Pure.
 *
 * A new package kind (079: Android, Web) = a `PackageFormat`, a `PackageKind` variant on both
 * sides, its sources here and its file names in `packageFiles` (the mirror of the Rust plan).
 */

export type PackageFormat = 'appiconset' | 'icns' | 'ico' | 'android' | 'web';
export const PACKAGE_FORMATS: readonly PackageFormat[] = [
  'appiconset',
  'icns',
  'ico',
  'android',
  'web',
];

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
  androidForeground: 'android-foreground',
  androidBackground: 'android-background',
  androidMonochrome: 'android-monochrome',
  androidLegacy: 'android-legacy',
  androidRound: 'android-round',
  androidPlay: 'android-play',
  webAny: 'web-any',
  webFavicon: 'web-favicon',
  webTouch: 'web-touch',
  webMaskable: 'web-maskable',
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
  /** Groups drawn (icon.json indexes); `null` = all (079: the adaptive layers). */
  groups: number[] | null;
  /** Draw the icon fill (079: not on the Android foreground and monochrome layers). */
  fill: boolean;
  /** The canvas scaled into the middle, the fill to the edges (079: 72/108, maskable 0.8). */
  scale: number;
  /** Light and dark in one SVG, switched by `prefers-color-scheme` (079 `favicon.svg`). */
  colorScheme: boolean;
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
    case 'android':
      return { kind: 'android', monochrome: c.monochrome };
    case 'web':
      return { kind: 'web' };
    default:
      return null;
  }
}

const spec = (
  id: string,
  appearance: ExportAppearance,
  mask: MaskShape = 'none',
  frame: 'macos' | null = null,
  more: Partial<PackageSourceSpec> = {},
): PackageSourceSpec => ({
  id,
  appearance,
  mask,
  frame,
  tint: GREY_TINT,
  groups: null,
  fill: true,
  scale: 1,
  colorScheme: false,
  ...more,
});

/**
 * The sources a package needs (Rust matches them by id). `groupCount`: the document's groups –
 * the Android layers split them (design 079 E4).
 */
export function packageSources(
  kind: PackageKind,
  c: ExportChoice,
  groupCount = 0,
): PackageSourceSpec[] {
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
    case 'android': {
      const { foreground, background } = androidLayers(groupCount, c.backgroundGroups);
      const scale = ANDROID_CANVAS_SCALE;
      const out = [
        spec(PACKAGE_SOURCE.androidForeground, 'light', 'none', null, {
          groups: foreground,
          fill: false,
          scale,
        }),
        spec(PACKAGE_SOURCE.androidBackground, 'light', 'none', null, {
          groups: background,
          scale,
        }),
        spec(PACKAGE_SOURCE.androidLegacy, 'light', 'squircle'),
        spec(PACKAGE_SOURCE.androidRound, 'light', 'circle'),
        spec(PACKAGE_SOURCE.androidPlay, 'light'),
      ];
      // themed icons: the foreground through the tinted calculation in grey (077 E2, 079 E5)
      if (kind.monochrome)
        out.push(
          spec(PACKAGE_SOURCE.androidMonochrome, 'tinted', 'none', null, {
            groups: foreground,
            fill: false,
            scale,
          }),
        );
      return out;
    }
    case 'web':
      return [
        spec(PACKAGE_SOURCE.webAny, 'light', c.mask),
        spec(PACKAGE_SOURCE.webFavicon, 'light', c.mask, null, { colorScheme: true }),
        spec(PACKAGE_SOURCE.webTouch, 'light'),
        spec(PACKAGE_SOURCE.webMaskable, 'light', 'none', null, { scale: WEB_MASKABLE_SCALE }),
      ];
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
    case 'android':
      return { folder: 'android', files: androidFiles(kind.monochrome) };
    case 'web':
      return { folder: 'web', files: [...WEB_FILES] };
  }
}
