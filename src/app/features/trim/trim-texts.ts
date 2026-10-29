import { translatable } from '../../core/i18n/i18n';

/** Texts of Trim and Extend (prompt 050). English is the source, German beside it. */
const EN = {
  hints: {
    trim: 'Trim: click (or drag across) the piece of a line or curve to cut away',
    extend: 'Extend: click near the end of a line or arc to lengthen it to the next edge',
  },
  escEnds: 'Esc ends',
  nothing: 'Nothing to extend to in that direction.',
} as const;

export const TRIM_TEXTS = translatable('trim', EN, {
  de: {
    hints: {
      trim: 'Trimmen: das Stück einer Linie oder Kurve anklicken (oder überstreichen), das wegfällt',
      extend:
        'Verlängern: nahe dem Ende einer Linie oder eines Bogens klicken – sie läuft bis zur nächsten Kante',
    },
    escEnds: 'Esc beendet',
    nothing: 'In dieser Richtung liegt nichts, bis wohin verlängert werden kann.',
  },
});
