import { translatable } from '../../core/i18n/i18n';

/** Texts of Live Corners (prompt 045). English is the source, German beside it. */
const EN = {
  widget:
    'Drag: round the corners · Alt-click: round / inverted / chamfer · double-click: Corners…',
  title: 'Corners',
  radius: 'Radius',
  kind: 'Corner',
  kinds: { round: 'Round', inverted: 'Inverted round', chamfer: 'Chamfer' },
  ok: 'OK',
  cancel: 'Cancel',
  none: 'The selection has no corners to round.',
} as const;

export const CORNERS_TEXTS = translatable('corners', EN, {
  de: {
    widget: 'Ziehen: Ecken abrunden · Alt-Klick: rund / invers rund / Fase · Doppelklick: Ecken…',
    title: 'Ecken',
    radius: 'Radius',
    kind: 'Ecke',
    kinds: { round: 'Rund', inverted: 'Invers rund', chamfer: 'Fase' },
    ok: 'OK',
    cancel: 'Abbrechen',
    none: 'Die Auswahl hat keine Ecken zum Abrunden.',
  },
});
