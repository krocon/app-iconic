import { translatable } from '../../core/i18n/i18n';

/** Texts of live fills (prompt 060). English is the source, German beside it. */
const EN = {
  // properties panel (prompt 066)
  section: 'Live fill',
  computed:
    'Computed from the outlines around it – it follows when they change. Edit them, not the path.',
  stale: 'The area is open: the fill keeps its last shape until the outlines close it again.',
  detach: 'Detach Fill',
  staleShort: 'open area',
  detachHint: 'The fill becomes an ordinary path that no longer follows.',
  hint: 'Fill: click an enclosed area · drag across several · Alt + click removes · Esc ends',
  loading: 'Fill: preparing…',
  noFace: 'There is no closed area here – the outlines must enclose it.',
  color: 'Fill colour',
  toolbar: 'Fill',
  live: 'Live – follows the outlines',
} as const;

export const LIVE_FILL_TEXTS = translatable('liveFill', EN, {
  de: {
    section: 'Live-Füllung',
    computed:
      'Aus den Umrissen ringsum berechnet – folgt, wenn sie sich ändern. Die Umrisse bearbeiten, nicht den Pfad.',
    stale:
      'Die Fläche ist offen: Die Füllung behält ihre letzte Form, bis die Umrisse sie wieder schließen.',
    detach: 'Füllung lösen',
    staleShort: 'offene Fläche',
    detachHint: 'Die Füllung wird ein gewöhnlicher Pfad, der nicht mehr folgt.',
    hint: 'Füllen: in eine umschlossene Fläche klicken · über mehrere ziehen · Alt + Klick entfernt · Esc beendet',
    loading: 'Füllen: wird vorbereitet …',
    noFace: 'Hier ist keine geschlossene Fläche – die Umrisse müssen sie umschließen.',
    color: 'Füllfarbe',
    toolbar: 'Füllen',
    live: 'Live – folgt den Umrissen',
  },
});
