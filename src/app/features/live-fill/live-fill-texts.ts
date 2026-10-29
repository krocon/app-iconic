import { translatable } from '../../core/i18n/i18n';

/** Texts of live fills (prompt 060). English is the source, German beside it. */
const EN = {
  hint: 'Fill: click an enclosed area · drag across several · Alt + click removes · Esc ends',
  loading: 'Fill: preparing…',
  noFace: 'There is no closed area here – the outlines must enclose it.',
  color: 'Fill colour',
  toolbar: 'Fill',
  live: 'Live – follows the outlines',
} as const;

export const LIVE_FILL_TEXTS = translatable('liveFill', EN, {
  de: {
    hint: 'Füllen: in eine umschlossene Fläche klicken · über mehrere ziehen · Alt + Klick entfernt · Esc beendet',
    loading: 'Füllen: wird vorbereitet …',
    noFace: 'Hier ist keine geschlossene Fläche – die Umrisse müssen sie umschließen.',
    color: 'Füllfarbe',
    toolbar: 'Füllen',
    live: 'Live – folgt den Umrissen',
  },
});
