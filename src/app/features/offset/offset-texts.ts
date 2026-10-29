import { translatable } from '../../core/i18n/i18n';

/** Texts of Offset Path and Outline Stroke (prompt 052). English is the source, German beside it. */
const EN = {
  title: 'Offset Path',
  distance: 'Distance',
  join: 'Corners',
  joins: { miter: 'Sharp (miter)', round: 'Round', bevel: 'Bevelled' },
  replace: 'Replace the original',
  hint: 'Positive grows outwards, negative shrinks inwards.',
  invalid: 'Please enter a distance other than 0.',
  nothing: 'Nothing is left at this distance.',
  noStroke: 'The selection has no stroke to outline.',
  needSelection: 'Select a shape first.',
  ok: 'OK',
  cancel: 'Cancel',
} as const;

export const OFFSET_TEXTS = translatable('offset', EN, {
  de: {
    title: 'Pfad verschieben',
    distance: 'Abstand',
    join: 'Ecken',
    joins: { miter: 'Spitz (Gehrung)', round: 'Rund', bevel: 'Abgeflacht' },
    replace: 'Original ersetzen',
    hint: 'Positiv wächst nach außen, negativ schrumpft nach innen.',
    invalid: 'Bitte einen Abstand ungleich 0 eingeben.',
    nothing: 'Bei diesem Abstand bleibt nichts übrig.',
    noStroke: 'Die Auswahl hat keinen Strich, der in eine Fläche umgewandelt werden kann.',
    needSelection: 'Zuerst eine Form auswählen.',
    ok: 'OK',
    cancel: 'Abbrechen',
  },
});
