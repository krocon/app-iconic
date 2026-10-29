import { translatable } from '../../core/i18n/i18n';

/** Texts of the small-size preview and the pixel grid (prompt 057). */
const EN = {
  title: 'Small sizes',
  size: (n: number) => `${n} px`,
} as const;

export const PREVIEW_TEXTS = translatable('smallPreview', EN, {
  de: {
    title: 'Kleine Größen',
    size: (n: number) => `${n} px`,
  },
});
