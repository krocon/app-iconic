import { translatable } from '../../core/i18n/i18n';

/** Texts of the start screen (prompt 082). English is the source, German beside it. */
const EN = {
  title: 'Start',
  welcome: 'Start with a recent icon or a template',
  recent: 'Recently Used',
  noRecent: 'No recent icons yet – open or save one and it appears here with a preview.',
  templates: 'Templates',
  blank: 'Blank Icon',
  open: 'Open…',
  close: 'Back to the Document',
  noPreview: 'No preview',
  recentCell: (name: string, location: string) => `${name}, ${location}`,
  templateNames: {
    ios: 'iOS App Icon',
    macos: 'macOS Icon',
    watchos: 'watchOS Icon',
    lightDark: 'Light & Dark',
  } as Record<string, string>,
  templateHints: {
    ios: 'Gradient, centred glyph, keylines as guides',
    macos: 'Squircle with plate and group shadow',
    watchos: 'Round, centred, no black background',
    lightDark: 'Background and glyph for light and dark',
  } as Record<string, string>,
} as const;

export const START_TEXTS = translatable('start', EN, {
  de: {
    title: 'Start',
    welcome: 'Mit einem zuletzt benutzten Icon oder einer Vorlage beginnen',
    recent: 'Zuletzt benutzt',
    noRecent:
      'Noch keine zuletzt benutzten Icons – öffnen oder sichern Sie eins, dann erscheint es hier mit Vorschau.',
    templates: 'Vorlagen',
    blank: 'Leeres Icon',
    open: 'Öffnen…',
    close: 'Zurück zum Dokument',
    noPreview: 'Keine Vorschau',
    recentCell: (name: string, location: string) => `${name}, ${location}`,
    templateNames: {
      ios: 'iOS-App-Icon',
      macos: 'macOS-Icon',
      watchos: 'watchOS-Icon',
      lightDark: 'Hell & Dunkel',
    },
    templateHints: {
      ios: 'Verlauf, zentriertes Motiv, Keylines als Hilfslinien',
      macos: 'Squircle mit Platte und Gruppenschatten',
      watchos: 'Rund, zentriert, kein schwarzer Hintergrund',
      lightDark: 'Hintergrund und Motiv für hell und dunkel',
    },
  },
});
