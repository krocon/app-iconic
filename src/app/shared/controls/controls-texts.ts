import { translatable } from '../../core/i18n/i18n';

/** Texts of the generic editors (design 009 E10). English is the source, German beside it (015). */
const EN = {
  mixed: 'mixed',
  keywords: 'Colour keyword',
  keywordNone: 'Keyword…',
  pickColor: 'Pick a colour',
  hex: 'Hex colour',
  gradient: 'Gradient',
  slider: 'Slider',
  dragHint: 'Drag to change',
  increase: 'Increase',
  decrease: 'Decrease',
  // the colour popover (prompt 074)
  colorDialog: (label: string) => `Colour: ${label}`,
  saturation: 'Saturation and brightness',
  hue: 'Hue',
  alpha: 'Opacity',
  format: 'Format',
  value: 'Value',
  system: 'System…',
  systemHint: 'The colour picker of the system',
  addToPalette: 'Add to palette',
  done: 'Done',
  swatch: (c: string) => `Use ${c}`,
} as const;

export const CONTROLS_TEXTS = translatable('controls', EN, {
  de: {
    mixed: 'gemischt',
    keywords: 'Farbname',
    keywordNone: 'Farbname …',
    pickColor: 'Farbe wählen',
    hex: 'Hex-Farbe',
    gradient: 'Verlauf',
    slider: 'Schieberegler',
    dragHint: 'Ziehen zum Ändern',
    increase: 'Erhöhen',
    decrease: 'Verringern',
    colorDialog: (label: string) => `Farbe: ${label}`,
    saturation: 'Sättigung und Helligkeit',
    hue: 'Farbton',
    alpha: 'Deckkraft',
    format: 'Format',
    value: 'Wert',
    system: 'System …',
    systemHint: 'Die Farbauswahl des Systems',
    addToPalette: 'Zur Palette hinzufügen',
    done: 'Fertig',
    swatch: (c: string) => `${c} verwenden`,
  },
});
