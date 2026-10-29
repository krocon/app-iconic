import { translatable } from '../../core/i18n/i18n';

/** Texts of Transform (prompt 053). English is the source, German beside it. */
const EN = {
  hints: {
    rotate: 'Rotate: drag around the pivot (⇧ 15° steps, ⌥ on release: copy); click sets the pivot',
    scale:
      'Scale: drag away from the pivot (⇧ proportional, ⌥ on release: copy); click sets the pivot',
    reflect:
      'Reflect: drag the mirror axis through the pivot (⇧ 45° steps, ⌥ on release: copy); click sets the pivot',
  },
  values: {
    rotate: 'Angle {v}°',
    scale: 'Scale {x} % × {y} %',
    reflect: 'Axis {v}°',
  },
  escEnds: 'Esc ends',
  needSelection: 'Select what to transform first.',
  title: 'Transform',
  move: 'Move',
  dx: 'X',
  dy: 'Y',
  rotate: 'Rotate',
  scale: 'Scale',
  sx: 'Width %',
  sy: 'Height %',
  reflect: 'Reflect',
  reflects: { none: 'None', horizontal: 'Horizontally', vertical: 'Vertically' },
  pivot: 'Reference point',
  anchors: {
    tl: 'Top left',
    t: 'Top',
    tr: 'Top right',
    l: 'Left',
    c: 'Centre',
    r: 'Right',
    bl: 'Bottom left',
    b: 'Bottom',
    br: 'Bottom right',
  },
  each: 'Transform each (about its own box)',
  copy: 'Copy',
  invalid: 'Please enter valid numbers (scale not 0).',
  ok: 'OK',
  cancel: 'Cancel',
} as const;

export const TRANSFORM_TEXTS = translatable('transform', EN, {
  de: {
    hints: {
      rotate:
        'Drehen: um den Bezugspunkt ziehen (⇧ 15°-Schritte, ⌥ beim Loslassen: Kopie); Klick setzt den Bezugspunkt',
      scale:
        'Skalieren: vom Bezugspunkt weg ziehen (⇧ proportional, ⌥ beim Loslassen: Kopie); Klick setzt den Bezugspunkt',
      reflect:
        'Spiegeln: die Spiegelachse durch den Bezugspunkt ziehen (⇧ 45°-Schritte, ⌥ beim Loslassen: Kopie); Klick setzt den Bezugspunkt',
    },
    values: {
      rotate: 'Winkel {v}°',
      scale: 'Skalierung {x} % × {y} %',
      reflect: 'Achse {v}°',
    },
    escEnds: 'Esc beendet',
    needSelection: 'Zuerst auswählen, was transformiert wird.',
    title: 'Transformieren',
    move: 'Verschieben',
    dx: 'X',
    dy: 'Y',
    rotate: 'Drehen',
    scale: 'Skalieren',
    sx: 'Breite %',
    sy: 'Höhe %',
    reflect: 'Spiegeln',
    reflects: { none: 'Nicht', horizontal: 'Horizontal', vertical: 'Vertikal' },
    pivot: 'Bezugspunkt',
    anchors: {
      tl: 'Oben links',
      t: 'Oben',
      tr: 'Oben rechts',
      l: 'Links',
      c: 'Mitte',
      r: 'Rechts',
      bl: 'Unten links',
      b: 'Unten',
      br: 'Unten rechts',
    },
    each: 'Einzeln transformieren (um die eigene Box)',
    copy: 'Kopie',
    invalid: 'Bitte gültige Zahlen eingeben (Skalierung nicht 0).',
    ok: 'OK',
    cancel: 'Abbrechen',
  },
});
