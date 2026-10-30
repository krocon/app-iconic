import { translatable } from '../../core/i18n/i18n';

/** Texts of effects and masks (prompt 076). English is the source, German beside it. */
const EN = {
  section: 'Effects',
  kinds: { dropShadow: 'Drop Shadow', innerShadow: 'Inner Shadow', blur: 'Blur' },
  color: 'Colour',
  opacity: 'Opacity',
  dx: 'X',
  dy: 'Y',
  radius: 'Blur',
  shared: 'Used by several elements – a change makes this one its own copy.',
  foreign: 'Own filter – edit it with “Edit SVG…”.',
  mask: 'Mask',
  maskTypes: { luminance: 'Luminance', alpha: 'Alpha' },
  release: 'Release Mask',
  maskCount: 'Select at least two elements in the same group: the front-most becomes the mask.',
} as const;

export const EFFECTS_TEXTS = translatable('effects', EN, {
  de: {
    section: 'Effekte',
    kinds: { dropShadow: 'Schlagschatten', innerShadow: 'Innerer Schatten', blur: 'Unschärfe' },
    color: 'Farbe',
    opacity: 'Deckkraft',
    dx: 'X',
    dy: 'Y',
    radius: 'Weichheit',
    shared: 'Wird von mehreren Elementen benutzt – eine Änderung gibt diesem eine eigene Kopie.',
    foreign: 'Eigener Filter – mit „SVG bearbeiten …“ ändern.',
    mask: 'Maske',
    maskTypes: { luminance: 'Luminanz', alpha: 'Alpha' },
    release: 'Maske lösen',
    maskCount: 'Mindestens zwei Elemente derselben Gruppe auswählen: das vorderste wird die Maske.',
  },
});
