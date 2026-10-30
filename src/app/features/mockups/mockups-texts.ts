import { translatable } from '../../core/i18n/i18n';

/** Texts of "In Context" (prompt 081). */
const EN = {
  title: 'In Context',
  scenes: {
    dock: 'macOS Dock',
    homeLight: 'iOS Home Screen (light)',
    homeDark: 'iOS Home Screen (dark)',
    spotlight: 'Spotlight and notification',
    taskbar: 'Windows taskbar',
  } as Record<string, string>,
  appearances: { light: 'Light', dark: 'Dark', tinted: 'Tinted' } as Record<string, string>,
  appearance: 'Appearance',
  size: (n: number, unit: string) => `Icon ${n} ${unit}`,
  sceneTitle: (scene: string, appearance: string, name: string) =>
    `${name} in ${scene}, ${appearance}`,
  scale: 'PNG scale',
  scaleOption: (n: number) => `${n}×`,
  copy: 'Copy as PNG',
  save: 'Save as PNG…',
  background: 'Background Image…',
  clearBackground: 'Remove Background Image',
  backgroundHint: 'Own scenery only – neighbouring icons are neutral placeholders.',
  close: 'Close',
  noDocument: 'No document is open.',
  badArguments: 'Unknown scene or scale.',
  copied: (scene: string) => `${scene} copied as PNG.`,
  saved: (scene: string) => `${scene} saved as PNG.`,
  failed: (reason: string) => `The scene could not be rendered: ${reason}`,
  backgroundFailed: (reason: string) => `The background image could not be read: ${reason}`,
  backgroundSvg: 'Choose a PNG, JPEG or WebP image as background.',
} as const;

export const MOCKUPS_TEXTS = translatable('mockups', EN, {
  de: {
    title: 'Im Kontext',
    scenes: {
      dock: 'macOS-Dock',
      homeLight: 'iOS-Home-Bildschirm (hell)',
      homeDark: 'iOS-Home-Bildschirm (dunkel)',
      spotlight: 'Spotlight und Mitteilung',
      taskbar: 'Windows-Taskleiste',
    },
    appearances: { light: 'Hell', dark: 'Dunkel', tinted: 'Getönt' },
    appearance: 'Erscheinungsbild',
    size: (n: number, unit: string) => `Icon ${n} ${unit}`,
    sceneTitle: (scene: string, appearance: string, name: string) =>
      `${name} in ${scene}, ${appearance}`,
    scale: 'PNG-Maßstab',
    scaleOption: (n: number) => `${n}×`,
    copy: 'Als PNG kopieren',
    save: 'Als PNG sichern…',
    background: 'Hintergrundbild…',
    clearBackground: 'Hintergrundbild entfernen',
    backgroundHint: 'Nur eigene Grafik – Nachbar-Icons sind neutrale Platzhalter.',
    close: 'Schließen',
    noDocument: 'Kein Dokument geöffnet.',
    badArguments: 'Unbekannte Szene oder unbekannter Maßstab.',
    copied: (scene: string) => `${scene} als PNG kopiert.`,
    saved: (scene: string) => `${scene} als PNG gesichert.`,
    failed: (reason: string) => `Die Szene konnte nicht gerendert werden: ${reason}`,
    backgroundFailed: (reason: string) =>
      `Das Hintergrundbild konnte nicht gelesen werden: ${reason}`,
    backgroundSvg: 'Bitte ein PNG-, JPEG- oder WebP-Bild als Hintergrund wählen.',
  },
});
