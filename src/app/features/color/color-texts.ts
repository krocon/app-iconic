import { translatable } from '../../core/i18n/i18n';

/** Texts of the colour workflow (prompt 074). English is the source, German beside it. */
const EN = {
  document: 'Document',
  recent: 'Recent',
  palette: 'Palette',
  section: 'Document Colours',
  sectionHint: 'Pick a colour, then the new one – it is replaced in the whole icon.',
  replaceWith: 'Replace with',
  replace: 'Replace',
  replaceNothing: 'No element has this colour.',
  uses: (n: number) => (n === 1 ? 'used once' : `used ${n} times`),
  eyedropperHint: 'Click a colour: it becomes the fill of the selection (Shift: stroke)',
  eyedropperNothing: 'Select the elements to colour first.',
  eyedropperMiss: 'No colour under the pointer.',
} as const;

export const COLOR_TEXTS = translatable('color', EN, {
  de: {
    document: 'Dokument',
    recent: 'Zuletzt',
    palette: 'Palette',
    section: 'Dokumentfarben',
    sectionHint: 'Eine Farbe wählen, dann die neue – sie wird im ganzen Icon ersetzt.',
    replaceWith: 'Ersetzen durch',
    replace: 'Ersetzen',
    replaceNothing: 'Kein Element hat diese Farbe.',
    uses: (n: number) => (n === 1 ? 'einmal benutzt' : `${n}-mal benutzt`),
    eyedropperHint: 'Eine Farbe anklicken: sie wird die Füllung der Auswahl (Umschalt: Kontur)',
    eyedropperNothing: 'Zuerst die Elemente auswählen, die die Farbe bekommen.',
    eyedropperMiss: 'Unter dem Zeiger ist keine Farbe.',
  },
});
