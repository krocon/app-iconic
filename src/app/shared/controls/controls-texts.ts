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
  },
});
