import { translatable } from '../../core/i18n/i18n';

/** Texts of patterns, mirror and clone (prompt 049). English is the source, German beside it. */
const EN = {
  hints: {
    center: 'Circular Pattern: click the centre point (Enter: centre of the selection)',
    mirror1: 'Mirror: click the first point of the mirror line',
    mirror2: 'Mirror: click the second point of the mirror line',
  },
  escEnds: 'Esc ends',
  needSelection: 'Select the shapes to copy first.',
  circularTitle: 'Circular Pattern',
  rectangularTitle: 'Rectangular Pattern',
  count: 'Quantity',
  angle: 'Total angle',
  columns: 'Columns',
  rows: 'Rows',
  dx: 'Spacing X',
  dy: 'Spacing Y',
  invalid: 'Please enter valid numbers.',
  ok: 'OK',
  cancel: 'Cancel',
} as const;

export const PATTERN_TEXTS = translatable('pattern', EN, {
  de: {
    hints: {
      center: 'Kreisförmiges Muster: Mittelpunkt klicken (Enter: Mitte der Auswahl)',
      mirror1: 'Spiegeln: ersten Punkt der Spiegelachse klicken',
      mirror2: 'Spiegeln: zweiten Punkt der Spiegelachse klicken',
    },
    escEnds: 'Esc beendet',
    needSelection: 'Zuerst die Formen auswählen, die kopiert werden.',
    circularTitle: 'Kreisförmiges Muster',
    rectangularTitle: 'Rechteckiges Muster',
    count: 'Anzahl',
    angle: 'Gesamtwinkel',
    columns: 'Spalten',
    rows: 'Zeilen',
    dx: 'Abstand X',
    dy: 'Abstand Y',
    invalid: 'Bitte gültige Zahlen eingeben.',
    ok: 'OK',
    cancel: 'Abbrechen',
  },
});
