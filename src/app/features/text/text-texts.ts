import { translatable } from '../../core/i18n/i18n';

/** Texts of live typography (prompt 075). English is the source, German beside it. */
const EN = {
  editor: 'Edit text – ⌘/Ctrl+Enter or click outside to finish, Esc to cancel',
  toolHint: 'Click to place text, then type',
  noText: 'Select a text element first.',
  missingTitle: (font: string) => `“${font}” is not installed.`,
  missingMessage: (fallback: string) =>
    `The outlines need the font itself. Convert with “${fallback}” instead?`,
  useFallback: 'Use it',
  cancel: 'Cancel',
  failed: 'The text could not be converted.',
} as const;

export const TEXT_TEXTS = translatable('text', EN, {
  de: {
    editor: 'Text bearbeiten – ⌘/Strg+Enter oder Klick daneben beendet, Esc bricht ab',
    toolHint: 'Klicken, um Text zu setzen, dann tippen',
    noText: 'Zuerst ein Textelement auswählen.',
    missingTitle: (font: string) => `„${font}“ ist nicht installiert.`,
    missingMessage: (fallback: string) =>
      `Für die Umrisse wird die Schrift selbst gebraucht. Stattdessen mit „${fallback}“ umwandeln?`,
    useFallback: 'Verwenden',
    cancel: 'Abbrechen',
    failed: 'Der Text konnte nicht umgewandelt werden.',
  },
});
