import { translatable } from '../../core/i18n/i18n';

/** Texts of the canvas template (prompt 087 E12). */
const EN = {
  set: (name: string) => `“${name}” is the template now (View › Template).`,
  failed: 'The template could not be set.',
  notDecodable: 'The image could not be read.',
  noClipboardImage: 'The clipboard holds no image.',
  noRasterLayer: 'Select a layer that shows a PNG image.',
  image: 'Template',
  opacity: (percent: number) => `Template Opacity: ${percent} %`,
} as const;

export const TEMPLATE_TEXTS = translatable('template', EN, {
  de: {
    set: (name: string) => `„${name}“ ist jetzt die Vorlage (Ansicht › Vorlage).`,
    failed: 'Die Vorlage konnte nicht gesetzt werden.',
    notDecodable: 'Das Bild konnte nicht gelesen werden.',
    noClipboardImage: 'Die Zwischenablage enthält kein Bild.',
    noRasterLayer: 'Eine Ebene wählen, die ein PNG-Bild zeigt.',
    image: 'Vorlage',
    opacity: (percent: number) => `Deckkraft der Vorlage: ${percent} %`,
  },
});
