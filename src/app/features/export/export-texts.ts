import { translatable } from '../../core/i18n/i18n';
import { MaskShape } from '../canvas/canvas-view.store';
import { ExportFormat } from './export-options';
import { ExportAppearance } from '../../core/export/export.models';
import { AppIconPlatform } from './export-packages';

/** Texts of the export (design 012). English is the source, German beside it (015). */
const EN = {
  title: 'Export',
  format: 'Format',
  formats: {
    svg: 'SVG',
    png: 'PNG',
    appiconset: 'Xcode icon set',
    icns: 'macOS .icns',
    ico: 'Windows .ico',
  } satisfies Record<ExportFormat, string>,
  platforms: 'Platforms',
  platformNames: {
    ios: 'iOS / iPadOS',
    macos: 'macOS',
    watchos: 'watchOS',
  } satisfies Record<AppIconPlatform, string>,
  /** Below the formats, per package format (design 078 E9). */
  formatHints: {
    appiconset:
      'AppIcon.appiconset with Contents.json: iOS 1024 (App Store icon without transparency; ' +
      'Dark and Tinted as chosen, Tinted in grey), macOS 16–512 @1x/@2x with mask and margin. ' +
      'Xcode 26 also takes the .icon file directly.',
    icns: 'macOS icon file, 16–1024 px, with mask, margin and shadow (Light).',
    ico: 'Windows icon file, 16, 24, 32, 48, 64 and 256 px as PNG (Light).',
  },
  appearancesIos: 'Appearances (iOS)',
  appearances: 'Appearances',
  light: 'Light',
  dark: 'Dark',
  appearanceNames: {
    light: 'Light',
    dark: 'Dark',
    tinted: 'Tinted (approximation)',
  } satisfies Record<ExportAppearance, string>,
  tint: 'Tint',
  sizes: 'Sizes (px)',
  mask: 'Platform mask',
  masks: {
    none: 'None (App Store)',
    squircle: 'Squircle (iOS, macOS)',
    circle: 'Circle (watchOS)',
  } satisfies Record<MaskShape, string>,
  effects: 'Approximate effects (shadow, glass)',
  dimensions: 'Dimensions',
  target: 'Folder',
  noTarget: 'No folder chosen',
  choose: 'Choose…',
  files: (n: number) => (n === 1 ? '1 file' : `${n} files`),
  untitled: 'Untitled',
  cancel: 'Cancel',
  close: 'Close',
  export: 'Export',
  stop: 'Stop',
  progress: (done: number, total: number) => `${done} of ${total}`,
  exists: 'Files with these names already exist in this folder. Replace them?',
  replace: 'Replace',
  done: (n: number) => (n === 1 ? 'Exported 1 file.' : `Exported ${n} files.`),
  cancelled: (n: number) => `Export stopped after ${n === 1 ? '1 file' : `${n} files`}.`,
  failed: (reason: string) => `Export failed: ${reason}`,
  reveal: 'Show in Folder',
  revealFailed: (reason: string) => `The file could not be shown: ${reason}`,
  noDocument: 'There is no document to export.',
  busy: 'An export is already running.',
  againTitle: 'Export Again',
  copied: (size: number) => `PNG (${size} px) copied to the clipboard.`,
  copyFailed: (reason: string) => `The PNG could not be copied: ${reason}`,
  badArguments: 'unknown appearance, size or tint',
  transparentWarning:
    'Some PNGs contain transparent pixels. Apple expects app icons without transparency – ' +
    'fill the background or export with a platform mask.',
} as const;

export const EXPORT_TEXTS = translatable('export', EN, {
  de: {
    title: 'Exportieren',
    format: 'Format',
    formats: {
      svg: 'SVG',
      png: 'PNG',
      appiconset: 'Xcode-Icon-Satz',
      icns: 'macOS .icns',
      ico: 'Windows .ico',
    },
    platforms: 'Plattformen',
    platformNames: { ios: 'iOS / iPadOS', macos: 'macOS', watchos: 'watchOS' },
    formatHints: {
      appiconset:
        'AppIcon.appiconset mit Contents.json: iOS 1024 (App-Store-Icon ohne Transparenz; ' +
        'Dunkel und Getönt nach Wahl, Getönt in Grau), macOS 16–512 @1x/@2x mit Maske und Rand. ' +
        'Xcode 26 nimmt die .icon-Datei auch direkt.',
      icns: 'macOS-Icon-Datei, 16–1024 px, mit Maske, Rand und Schatten (Hell).',
      ico: 'Windows-Icon-Datei, 16, 24, 32, 48, 64 und 256 px als PNG (Hell).',
    },
    appearancesIos: 'Erscheinungsbilder (iOS)',
    appearances: 'Erscheinungsbilder',
    light: 'Hell',
    dark: 'Dunkel',
    appearanceNames: { light: 'Hell', dark: 'Dunkel', tinted: 'Getönt (Annäherung)' },
    tint: 'Tönung',
    sizes: 'Größen (px)',
    mask: 'Plattform-Maske',
    masks: {
      none: 'Keine (App Store)',
      squircle: 'Squircle (iOS, macOS)',
      circle: 'Kreis (watchOS)',
    },
    effects: 'Effekte annähern (Schatten, Glas)',
    dimensions: 'Bemaßungen',
    target: 'Ordner',
    noTarget: 'Kein Ordner gewählt',
    choose: 'Wählen …',
    files: (n: number) => (n === 1 ? '1 Datei' : `${n} Dateien`),
    untitled: 'Unbenannt',
    cancel: 'Abbrechen',
    close: 'Schließen',
    export: 'Exportieren',
    stop: 'Anhalten',
    progress: (done: number, total: number) => `${done} von ${total}`,
    exists: 'In diesem Ordner gibt es schon Dateien mit diesen Namen. Ersetzen?',
    replace: 'Ersetzen',
    done: (n: number) => (n === 1 ? '1 Datei exportiert.' : `${n} Dateien exportiert.`),
    cancelled: (n: number) => `Export nach ${n === 1 ? '1 Datei' : `${n} Dateien`} angehalten.`,
    failed: (reason: string) => `Export fehlgeschlagen: ${reason}`,
    reveal: 'Im Ordner zeigen',
    revealFailed: (reason: string) => `Die Datei konnte nicht gezeigt werden: ${reason}`,
    noDocument: 'Es gibt kein Dokument zum Exportieren.',
    busy: 'Es läuft schon ein Export.',
    againTitle: 'Erneut exportieren',
    copied: (size: number) => `PNG (${size} px) in die Zwischenablage kopiert.`,
    copyFailed: (reason: string) => `Das PNG konnte nicht kopiert werden: ${reason}`,
    badArguments: 'unbekanntes Erscheinungsbild, unbekannte Größe oder Tönung',
    transparentWarning:
      'Einige PNGs enthalten transparente Pixel. Apple erwartet App-Icons ohne Transparenz – ' +
      'fülle den Hintergrund oder exportiere mit einer Plattform-Maske.',
  },
});
