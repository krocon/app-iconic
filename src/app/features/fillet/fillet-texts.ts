import { translatable } from '../../core/i18n/i18n';

/** Texts of Fillet and Chamfer (prompt 051). English is the source, German beside it. */
const EN = {
  hints: {
    fillet: 'Fillet: click a corner, or the first and then the second line or curve',
    chamfer: 'Chamfer: click a corner, or the first and then the second line or curve',
    second: 'click the second line or curve',
  },
  escEnds: 'Esc ends',
  titles: { fillet: 'Fillet', chamfer: 'Chamfer' },
  radius: 'Radius',
  distance: 'Distance',
  errors: {
    noSide: 'Click on a line or curve.',
    noCorner: 'These two do not meet in a corner.',
    tooLarge: 'The radius is too large for this corner.',
  },
  ok: 'OK',
  cancel: 'Cancel',
} as const;

export const FILLET_TEXTS = translatable('fillet', EN, {
  de: {
    hints: {
      fillet:
        'Verrunden: eine Ecke anklicken, oder erst die eine, dann die andere Linie oder Kurve',
      chamfer: 'Fasen: eine Ecke anklicken, oder erst die eine, dann die andere Linie oder Kurve',
      second: 'zweite Linie oder Kurve anklicken',
    },
    escEnds: 'Esc beendet',
    titles: { fillet: 'Verrunden', chamfer: 'Fasen' },
    radius: 'Radius',
    distance: 'Abstand',
    errors: {
      noSide: 'Auf eine Linie oder Kurve klicken.',
      noCorner: 'Die beiden treffen sich nicht in einer Ecke.',
      tooLarge: 'Der Radius ist zu groß für diese Ecke.',
    },
    ok: 'OK',
    cancel: 'Abbrechen',
  },
});
